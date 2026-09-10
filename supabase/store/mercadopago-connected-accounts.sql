-- Mercado Pago OAuth para contas dos clientes do CRM PLUS.
-- Aplicado no projeto central sodcfarvfhkdjecjmdwc em 10/09/2026.
-- Este fluxo e separado da cobranca das assinaturas do proprio CRM PLUS.

create table if not exists private.mp_connected_accounts (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  provider_user_id bigint not null,
  public_key text,
  scope text not null,
  live_mode boolean not null default true,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text not null,
  token_expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active','revoked','error')),
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  refreshed_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists mp_connected_accounts_provider_user_active_idx
  on private.mp_connected_accounts(provider_user_id)
  where status = 'active';
create index if not exists mp_connected_accounts_connected_by_idx
  on private.mp_connected_accounts(connected_by);

create table if not exists private.mp_oauth_states (
  state_hash text primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  code_verifier_ciphertext text not null,
  terms_version text not null,
  terms_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  used_at timestamptz,
  check (expires_at > created_at)
);
create index if not exists mp_oauth_states_account_user_idx
  on private.mp_oauth_states(account_id,user_id,created_at desc);
create index if not exists mp_oauth_states_expiry_idx
  on private.mp_oauth_states(expires_at);

create table if not exists private.mp_payment_terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  provider text not null default 'mercadopago' check (provider = 'mercadopago'),
  terms_version text not null,
  terms_hash text not null,
  accepted_at timestamptz not null default now(),
  user_agent text
);
create index if not exists mp_payment_terms_account_idx
  on private.mp_payment_terms_acceptances(account_id,accepted_at desc);
create index if not exists mp_payment_terms_user_idx
  on private.mp_payment_terms_acceptances(user_id,accepted_at desc);

create table if not exists private.mp_app_payment_settings (
  account_id uuid not null references public.accounts(id) on delete cascade,
  app_id text not null references public.apps(id) on delete cascade,
  provider text not null default 'mercadopago' check (provider = 'mercadopago'),
  enabled boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(account_id,app_id,provider)
);
create index if not exists mp_app_payment_settings_app_idx
  on private.mp_app_payment_settings(app_id,enabled);

alter table private.mp_connected_accounts enable row level security;
alter table private.mp_oauth_states enable row level security;
alter table private.mp_payment_terms_acceptances enable row level security;
alter table private.mp_app_payment_settings enable row level security;

revoke all on private.mp_connected_accounts from public, anon, authenticated;
revoke all on private.mp_oauth_states from public, anon, authenticated;
revoke all on private.mp_payment_terms_acceptances from public, anon, authenticated;
revoke all on private.mp_app_payment_settings from public, anon, authenticated;

grant select, insert, update, delete on private.mp_connected_accounts to service_role;
grant select, insert, update, delete on private.mp_oauth_states to service_role;
grant select, insert on private.mp_payment_terms_acceptances to service_role;
grant select, insert, update, delete on private.mp_app_payment_settings to service_role;

create or replace function public.mp_connected_account_get(target_account uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select to_jsonb(x)
  from (
    select provider_user_id, public_key, scope, live_mode, token_expires_at, status, connected_at, updated_at
    from private.mp_connected_accounts
    where account_id = target_account
  ) x;
$$;

create or replace function public.mp_connected_app_settings_get(target_account uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('app_id', app_id, 'enabled', enabled, 'updated_at', updated_at) order by app_id), '[]'::jsonb)
  from private.mp_app_payment_settings
  where account_id = target_account;
$$;

create or replace function public.mp_oauth_begin(
  target_state_hash text,
  target_account uuid,
  target_user uuid,
  verifier_ciphertext text,
  target_terms_version text,
  target_terms_hash text,
  target_user_agent text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from private.mp_oauth_states where expires_at <= now();
  insert into private.mp_payment_terms_acceptances(account_id,user_id,terms_version,terms_hash,user_agent)
  values(target_account,target_user,target_terms_version,target_terms_hash,left(target_user_agent,500));
  insert into private.mp_oauth_states(state_hash,account_id,user_id,code_verifier_ciphertext,terms_version,terms_hash)
  values(target_state_hash,target_account,target_user,verifier_ciphertext,target_terms_version,target_terms_hash);
end;
$$;

create or replace function public.mp_oauth_consume(target_state_hash text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare result jsonb;
begin
  update private.mp_oauth_states
  set used_at = now()
  where state_hash = target_state_hash and used_at is null and expires_at > now()
  returning jsonb_build_object(
    'account_id',account_id,
    'user_id',user_id,
    'code_verifier_ciphertext',code_verifier_ciphertext,
    'terms_version',terms_version,
    'terms_hash',terms_hash
  ) into result;
  return result;
end;
$$;

create or replace function public.mp_connected_account_upsert(
  target_account uuid,
  target_provider_user_id bigint,
  target_public_key text,
  target_scope text,
  target_live_mode boolean,
  target_access_token_ciphertext text,
  target_refresh_token_ciphertext text,
  target_token_expires_at timestamptz,
  target_connected_by uuid
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into private.mp_connected_accounts(
    account_id,provider_user_id,public_key,scope,live_mode,access_token_ciphertext,refresh_token_ciphertext,
    token_expires_at,status,connected_by,connected_at,refreshed_at,revoked_at,updated_at
  ) values (
    target_account,target_provider_user_id,target_public_key,target_scope,target_live_mode,target_access_token_ciphertext,target_refresh_token_ciphertext,
    target_token_expires_at,'active',target_connected_by,now(),null,null,now()
  )
  on conflict(account_id) do update set
    provider_user_id=excluded.provider_user_id,
    public_key=excluded.public_key,
    scope=excluded.scope,
    live_mode=excluded.live_mode,
    access_token_ciphertext=excluded.access_token_ciphertext,
    refresh_token_ciphertext=excluded.refresh_token_ciphertext,
    token_expires_at=excluded.token_expires_at,
    status='active',connected_by=excluded.connected_by,connected_at=now(),refreshed_at=null,revoked_at=null,updated_at=now();
end;
$$;

create or replace function public.mp_connected_account_disconnect(target_account uuid, target_user uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update private.mp_connected_accounts
  set status='revoked',access_token_ciphertext='erased',refresh_token_ciphertext='erased',token_expires_at=now(),revoked_at=now(),updated_at=now()
  where account_id=target_account and status='active';
  update private.mp_app_payment_settings
  set enabled=false,updated_by=target_user,updated_at=now()
  where account_id=target_account and enabled=true;
end;
$$;

create or replace function public.mp_connected_app_setting_set(target_account uuid, target_app text, target_enabled boolean, target_user uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into private.mp_app_payment_settings(account_id,app_id,provider,enabled,updated_by,updated_at)
  values(target_account,target_app,'mercadopago',target_enabled,target_user,now())
  on conflict(account_id,app_id,provider) do update set enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=now();
end;
$$;

revoke all on function public.mp_connected_account_get(uuid) from public, anon, authenticated;
revoke all on function public.mp_connected_app_settings_get(uuid) from public, anon, authenticated;
revoke all on function public.mp_oauth_begin(text,uuid,uuid,text,text,text,text) from public, anon, authenticated;
revoke all on function public.mp_oauth_consume(text) from public, anon, authenticated;
revoke all on function public.mp_connected_account_upsert(uuid,bigint,text,text,boolean,text,text,timestamptz,uuid) from public, anon, authenticated;
revoke all on function public.mp_connected_account_disconnect(uuid,uuid) from public, anon, authenticated;
revoke all on function public.mp_connected_app_setting_set(uuid,text,boolean,uuid) from public, anon, authenticated;

grant execute on function public.mp_connected_account_get(uuid) to service_role;
grant execute on function public.mp_connected_app_settings_get(uuid) to service_role;
grant execute on function public.mp_oauth_begin(text,uuid,uuid,text,text,text,text) to service_role;
grant execute on function public.mp_oauth_consume(text) to service_role;
grant execute on function public.mp_connected_account_upsert(uuid,bigint,text,text,boolean,text,text,timestamptz,uuid) to service_role;
grant execute on function public.mp_connected_account_disconnect(uuid,uuid) to service_role;
grant execute on function public.mp_connected_app_setting_set(uuid,text,boolean,uuid) to service_role;
