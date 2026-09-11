begin;

alter table public.accounts
  add column if not exists cnpj text;

comment on column public.accounts.cnpj is 'CNPJ da empresa, armazenado somente com 14 digitos; editavel pelo titular conforme RLS da conta.';

create or replace function public.valid_cnpj(value text)
returns boolean
language plpgsql
immutable
security invoker
set search_path=''
as $$
declare
  d text := regexp_replace(coalesce(value,''),'[^0-9]','','g');
  i int;
  total int := 0;
  weight int;
  remainder int;
  check1 int;
  check2 int;
begin
  if length(d) <> 14 or d = repeat(substr(d,1,1),14) then return false; end if;

  weight := 5;
  for i in 1..12 loop
    total := total + substr(d,i,1)::int * weight;
    weight := weight - 1;
    if weight = 1 then weight := 9; end if;
  end loop;
  remainder := total % 11;
  check1 := case when remainder < 2 then 0 else 11 - remainder end;
  if check1 <> substr(d,13,1)::int then return false; end if;

  total := 0;
  weight := 6;
  for i in 1..13 loop
    total := total + substr(d,i,1)::int * weight;
    weight := weight - 1;
    if weight = 1 then weight := 9; end if;
  end loop;
  remainder := total % 11;
  check2 := case when remainder < 2 then 0 else 11 - remainder end;
  return check2 = substr(d,14,1)::int;
end;
$$;

revoke all on function public.valid_cnpj(text) from public, anon;
grant execute on function public.valid_cnpj(text) to authenticated, service_role;

alter table public.accounts drop constraint if exists accounts_cnpj_valid;
alter table public.accounts add constraint accounts_cnpj_valid
  check (cnpj is null or (cnpj ~ '^[0-9]{14}$' and public.valid_cnpj(cnpj)));

alter table private.signup_identity_reservations
  add column if not exists document_last4 text;

alter table private.signup_identities
  add column if not exists document_last4 text;

create or replace function public.reserve_signup_identity(
  reservation_token text,
  document text,
  full_name text,
  birth_date text,
  email text,
  provider_verified boolean,
  verification_provider text
) returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  d text := regexp_replace(coalesce(document,''),'[^0-9]','','g');
  n text := lower(regexp_replace(trim(coalesce(full_name,'')),'\s+',' ','g'));
  b text := regexp_replace(coalesce(birth_date,''),'[^0-9]','','g');
  e text := lower(trim(coalesce(email,'')));
  th text; dh text; nh text; bh text; eh text;
  existing_email text;
begin
  if length(reservation_token) < 24 then return 'invalid_request'; end if;
  if not private.valid_cpf(d) then return 'invalid_cpf'; end if;
  if length(n) < 5 or position(' ' in n) = 0 then return 'invalid_name'; end if;
  if length(b) <> 8 then return 'invalid_birth_date'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return 'invalid_email'; end if;

  delete from private.signup_identity_reservations where expires_at <= now();

  th := private.antifraud_hmac(reservation_token);
  dh := private.antifraud_hmac(d);
  nh := private.antifraud_hmac(n);
  bh := private.antifraud_hmac(b);
  eh := private.antifraud_hmac(e);

  if exists(select 1 from private.signup_identities where document_hash = dh) then
    return 'document_used';
  end if;

  select r.email_hash into existing_email
  from private.signup_identity_reservations r
  where r.document_hash = dh and r.expires_at > now()
  limit 1;
  if found and existing_email <> eh then return 'document_reserved'; end if;

  delete from private.signup_identity_reservations where document_hash = dh;
  insert into private.signup_identity_reservations(
    token_hash,document_hash,document_last4,email_hash,name_hash,birth_hash,verified,provider
  ) values(
    th,dh,right(d,4),eh,nh,bh,provider_verified,coalesce(nullif(trim(verification_provider),''),'local')
  );
  return 'reserved';
end;
$$;

revoke all on function public.reserve_signup_identity(text,text,text,text,text,boolean,text) from public, anon, authenticated;
grant execute on function public.reserve_signup_identity(text,text,text,text,text,boolean,text) to service_role;

create or replace function public.finalize_signup_identity(reservation_token text, target_account uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid := (select auth.uid());
  u auth.users%rowtype;
  r private.signup_identity_reservations%rowtype;
  th text; eh text;
begin
  if uid is null then raise exception 'identity_auth_required'; end if;
  if not private.is_account_owner(target_account) then raise exception 'identity_owner_required'; end if;
  select * into strict u from auth.users where id = uid;
  if nullif(u.email,'') is null or u.email_confirmed_at is null then raise exception 'identity_email_required'; end if;
  th := private.antifraud_hmac(reservation_token);
  eh := private.antifraud_hmac(lower(trim(u.email)));
  select * into r from private.signup_identity_reservations where token_hash=th and expires_at>now();
  if not found then
    if exists(select 1 from private.signup_identities where user_id=uid and account_id=target_account) then return true; end if;
    raise exception 'identity_reservation_invalid';
  end if;
  if r.email_hash <> eh then raise exception 'identity_email_mismatch'; end if;

  if exists(select 1 from private.signup_identities where document_hash=r.document_hash and user_id<>uid) then
    raise exception 'identity_document_used';
  end if;
  if exists(select 1 from private.signup_identities where user_id=uid and document_hash<>r.document_hash) then
    raise exception 'identity_user_changed';
  end if;

  insert into private.signup_identities(
    document_hash,document_last4,user_id,account_id,email_hash,name_hash,birth_hash,verified,provider
  ) values(
    r.document_hash,r.document_last4,uid,target_account,r.email_hash,r.name_hash,r.birth_hash,r.verified,r.provider
  )
  on conflict (document_hash) do update set
    account_id=excluded.account_id,
    document_last4=coalesce(private.signup_identities.document_last4,excluded.document_last4),
    email_hash=excluded.email_hash,
    name_hash=excluded.name_hash,
    birth_hash=excluded.birth_hash,
    verified=excluded.verified,
    provider=excluded.provider
  where private.signup_identities.user_id=uid;
  if not found then raise exception 'identity_document_used'; end if;
  delete from private.signup_identity_reservations where token_hash=th;
  return true;
end;
$$;

revoke all on function public.finalize_signup_identity(text,uuid) from public, anon;
grant execute on function public.finalize_signup_identity(text,uuid) to authenticated;

create or replace function public.current_identity_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  uid uuid := (select auth.uid());
  identity_row private.signup_identities%rowtype;
  masked_value text;
begin
  if uid is null then raise exception 'identity_auth_required'; end if;

  select * into identity_row
  from private.signup_identities
  where user_id = uid
  limit 1;

  if not found then
    return jsonb_build_object('registered',false,'masked',null,'verified',false);
  end if;

  masked_value := case
    when identity_row.document_last4 is null or length(identity_row.document_last4) <> 4 then null
    else 'CPF final ' || identity_row.document_last4
  end;

  return jsonb_build_object(
    'registered',true,
    'masked',masked_value,
    'verified',identity_row.verified
  );
end;
$$;

revoke all on function public.current_identity_summary() from public, anon;
grant execute on function public.current_identity_summary() to authenticated;

commit;
