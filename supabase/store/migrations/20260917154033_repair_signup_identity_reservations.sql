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
  existing private.signup_identity_reservations%rowtype;
  linked_to_auth boolean := false;
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

  select * into existing
  from private.signup_identity_reservations r
  where r.document_hash = dh and r.expires_at > now()
  limit 1;

  if found then
    select exists(
      select 1
      from auth.users u
      where nullif(u.raw_user_meta_data->>'identity_reservation','') is not null
        and private.antifraud_hmac(u.raw_user_meta_data->>'identity_reservation') = existing.token_hash
    ) into linked_to_auth;

    if linked_to_auth then
      return 'signup_pending';
    end if;

    if existing.email_hash <> eh and existing.created_at > now() - interval '60 seconds' then
      return 'document_reserved';
    end if;

    delete from private.signup_identity_reservations where token_hash = existing.token_hash;
  end if;

  insert into private.signup_identity_reservations(token_hash,document_hash,email_hash,name_hash,birth_hash,verified,provider)
  values(th,dh,eh,nh,bh,provider_verified,coalesce(nullif(trim(verification_provider),''),'local'));
  return 'reserved';
end;
$$;

revoke all on function public.reserve_signup_identity(text,text,text,text,text,boolean,text) from public, anon, authenticated;
grant execute on function public.reserve_signup_identity(text,text,text,text,text,boolean,text) to service_role;

create or replace function public.release_signup_identity(reservation_token text)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  th text;
  removed integer := 0;
begin
  if length(trim(coalesce(reservation_token,''))) < 24 then return false; end if;
  th := private.antifraud_hmac(trim(reservation_token));

  delete from private.signup_identity_reservations r
  where r.token_hash = th
    and not exists(
      select 1
      from auth.users u
      where nullif(u.raw_user_meta_data->>'identity_reservation','') is not null
        and private.antifraud_hmac(u.raw_user_meta_data->>'identity_reservation') = r.token_hash
    );
  get diagnostics removed = row_count;
  return removed > 0;
end;
$$;

revoke all on function public.release_signup_identity(text) from public, anon, authenticated;
grant execute on function public.release_signup_identity(text) to service_role;

delete from private.signup_identity_reservations r
where r.created_at < now() - interval '60 seconds'
  and not exists(
    select 1
    from auth.users u
    where nullif(u.raw_user_meta_data->>'identity_reservation','') is not null
      and private.antifraud_hmac(u.raw_user_meta_data->>'identity_reservation') = r.token_hash
  );
