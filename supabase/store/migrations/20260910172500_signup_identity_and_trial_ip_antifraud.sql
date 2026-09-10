begin;

create table if not exists private.signup_identity_reservations (
  token_hash text primary key,
  document_hash text not null unique,
  email_hash text not null,
  name_hash text not null,
  birth_hash text not null,
  verified boolean not null default false,
  provider text not null default 'local',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '48 hours'
);

create table if not exists private.signup_identities (
  document_hash text primary key,
  user_id uuid not null unique,
  account_id uuid not null unique,
  email_hash text not null,
  name_hash text not null,
  birth_hash text not null,
  verified boolean not null default false,
  provider text not null,
  created_at timestamptz not null default now()
);

create table if not exists private.mp_trial_ip_locks (
  ip_hash text primary key,
  account_id uuid not null,
  user_id uuid not null,
  first_subscription_id uuid not null,
  first_app_id text not null,
  created_at timestamptz not null default now()
);

alter table private.signup_identity_reservations enable row level security;
alter table private.signup_identities enable row level security;
alter table private.mp_trial_ip_locks enable row level security;
revoke all on private.signup_identity_reservations, private.signup_identities, private.mp_trial_ip_locks from public, anon, authenticated;

create or replace function private.antifraud_hmac(value text)
returns text
language plpgsql
stable
security definer
set search_path=''
as $$
declare k bytea;
begin
  select secret into strict k from private.trial_key where singleton;
  return encode(extensions.hmac(coalesce(value,''), encode(k,'hex'), 'sha256'), 'hex');
end;
$$;
revoke all on function private.antifraud_hmac(text) from public, anon, authenticated;

create or replace function private.valid_cpf(value text)
returns boolean
language plpgsql
immutable
security invoker
set search_path=''
as $$
declare
  d text := regexp_replace(coalesce(value,''),'[^0-9]','','g');
  i int; total int := 0; r int; d1 int; d2 int;
begin
  if length(d) <> 11 or d = repeat(substr(d,1,1),11) then return false; end if;
  for i in 1..9 loop total := total + substr(d,i,1)::int * (11-i); end loop;
  r := total % 11;
  d1 := case when r < 2 then 0 else 11-r end;
  if d1 <> substr(d,10,1)::int then return false; end if;
  total := 0;
  for i in 1..10 loop total := total + substr(d,i,1)::int * (12-i); end loop;
  r := total % 11;
  d2 := case when r < 2 then 0 else 11-r end;
  return d2 = substr(d,11,1)::int;
end;
$$;
revoke all on function private.valid_cpf(text) from public, anon, authenticated;

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
  insert into private.signup_identity_reservations(token_hash,document_hash,email_hash,name_hash,birth_hash,verified,provider)
  values(th,dh,eh,nh,bh,provider_verified,coalesce(nullif(trim(verification_provider),''),'local'));
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
  if not found then raise exception 'identity_reservation_invalid'; end if;
  if r.email_hash <> eh then raise exception 'identity_email_mismatch'; end if;

  if exists(select 1 from private.signup_identities where document_hash=r.document_hash and user_id<>uid) then
    raise exception 'identity_document_used';
  end if;
  if exists(select 1 from private.signup_identities where user_id=uid and document_hash<>r.document_hash) then
    raise exception 'identity_user_changed';
  end if;

  insert into private.signup_identities(document_hash,user_id,account_id,email_hash,name_hash,birth_hash,verified,provider)
  values(r.document_hash,uid,target_account,r.email_hash,r.name_hash,r.birth_hash,r.verified,r.provider)
  on conflict (document_hash) do update set
    account_id=excluded.account_id,
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

create or replace function public.mp_trial_eligible_ip(target_account uuid, target_app text, target_user uuid, client_ip text)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare ip text := trim(coalesce(client_ip,'')); ih text;
begin
  if ip = '' or length(ip) > 128 then return false; end if;
  ih := private.antifraud_hmac(ip);
  if not public.mp_trial_eligible(target_account,target_app,target_user) then return false; end if;
  return not exists(
    select 1 from private.mp_trial_ip_locks l
    where l.ip_hash=ih and l.account_id<>target_account
  );
end;
$$;
revoke all on function public.mp_trial_eligible_ip(uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.mp_trial_eligible_ip(uuid,text,uuid,text) to service_role;

create or replace function public.mp_lock_trial_ip(local_id uuid, client_ip text)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  s public.mp_subscriptions%rowtype;
  ip text := trim(coalesce(client_ip,''));
  ih text;
  existing_account uuid;
begin
  if ip='' or length(ip)>128 then return false; end if;
  select * into strict s from public.mp_subscriptions where id=local_id;
  if not s.trial_requested or s.created_by_user_id is null then return false; end if;
  ih := private.antifraud_hmac(ip);
  perform pg_advisory_xact_lock(hashtextextended('mp-trial-ip:'||ih,0));
  select account_id into existing_account from private.mp_trial_ip_locks where ip_hash=ih;
  if found then return existing_account=s.account_id; end if;
  insert into private.mp_trial_ip_locks(ip_hash,account_id,user_id,first_subscription_id,first_app_id)
  values(ih,s.account_id,s.created_by_user_id,s.id,s.app_id);
  return true;
end;
$$;
revoke all on function public.mp_lock_trial_ip(uuid,text) from public, anon, authenticated;
grant execute on function public.mp_lock_trial_ip(uuid,text) to service_role;

commit;
