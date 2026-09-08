-- CRM PLUS Store — Supabase central
-- Projeto alvo: sodcfarvfhkdjecjmdwc
-- Responsabilidade: Auth, contas, membros, acessos, catálogo, assinatura/Stripe e auditoria.
-- PROIBIDO armazenar aqui dados operacionais de Zeus, Artemis, Kronos ou Athena.
-- Cada aplicativo terá seu próprio projeto Supabase e suas próprias chaves.

create extension if not exists pgcrypto;
create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

-- PERFIS ---------------------------------------------------------------
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- CONTAS / EMPRESAS -----------------------------------------------------
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('active','suspended','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.account_members (
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  status text not null default 'active' check (status in ('active','suspended')),
  created_at timestamptz not null default now(),
  primary key (account_id, user_id)
);

create index if not exists account_members_user_idx on public.account_members(user_id, status);

-- Permissões separadas do acesso aos apps.
-- Ex.: um usuário pode abrir Zeus mas não alterar Configurações.
create table if not exists public.member_permissions (
  account_id uuid not null,
  user_id uuid not null,
  permission text not null,
  created_at timestamptz not null default now(),
  primary key (account_id, user_id, permission),
  foreign key (account_id, user_id)
    references public.account_members(account_id, user_id)
    on delete cascade
);

create index if not exists member_permissions_lookup_idx
  on public.member_permissions(account_id, user_id, permission);

-- CATÁLOGO DA STORE -----------------------------------------------------
create table if not exists public.apps (
  id text primary key,
  name text not null,
  category text not null,
  status text not null default 'active' check (status in ('active','hidden','retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  app_id text not null references public.apps(id) on delete cascade,
  billing_interval text not null check (billing_interval in ('monthly','semiannual','annual')),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'brl',
  stripe_price_id text unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (app_id, billing_interval)
);

-- Apps contratados por uma conta. Este registro é o entitlement central.
-- tenant_key é apenas uma chave de correlação para o futuro projeto Supabase de cada app.
create table if not exists public.account_apps (
  account_id uuid not null references public.accounts(id) on delete cascade,
  app_id text not null references public.apps(id) on delete restrict,
  plan_id uuid references public.plans(id) on delete set null,
  status text not null default 'active' check (status in ('trialing','active','past_due','canceled','suspended')),
  tenant_key uuid not null default gen_random_uuid(),
  seats integer not null default 4 check (seats > 0),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, app_id),
  unique (tenant_key)
);

create index if not exists account_apps_status_idx on public.account_apps(account_id, status);

-- Quais apps cada membro pode abrir. O app também precisa estar ativo em account_apps.
create table if not exists public.member_app_access (
  account_id uuid not null,
  user_id uuid not null,
  app_id text not null references public.apps(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (account_id, user_id, app_id),
  foreign key (account_id, user_id)
    references public.account_members(account_id, user_id)
    on delete cascade
);

create index if not exists member_app_access_user_idx
  on public.member_app_access(user_id, account_id, app_id);

-- ÁREA PRIVADA: BILLING / STRIPE / CONVITES / AUDITORIA ----------------
create table if not exists private.stripe_customers (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.billing_subscriptions (
  stripe_subscription_id text primary key,
  account_id uuid not null references public.accounts(id) on delete cascade,
  app_id text references public.apps(id) on delete set null,
  plan_id uuid references public.plans(id) on delete set null,
  stripe_customer_id text not null,
  stripe_price_id text,
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists billing_subscriptions_account_idx
  on private.billing_subscriptions(account_id, status);

-- Idempotência de webhook: cada evento Stripe só pode ser processado uma vez.
create table if not exists private.stripe_events (
  stripe_event_id text primary key,
  event_type text not null,
  processing_status text not null default 'received' check (processing_status in ('received','processed','failed')),
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists private.account_invitations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role = 'member'),
  invited_by uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists account_invitations_account_idx
  on private.account_invitations(account_id, created_at desc);

create table if not exists private.audit_logs (
  id bigint generated always as identity primary key,
  account_id uuid references public.accounts(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_account_created_idx
  on private.audit_logs(account_id, created_at desc);

-- HELPERS DE AUTORIZAÇÃO -----------------------------------------------
-- SECURITY DEFINER fica em schema privado e não é uma API pública.
create or replace function private.is_account_member(target_account uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.account_members m
    where m.account_id = target_account
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create or replace function private.is_account_owner(target_account uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.account_members m
    where m.account_id = target_account
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
      and m.status = 'active'
  );
$$;

create or replace function private.has_account_permission(target_account uuid, target_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_account_owner(target_account)
    or exists (
      select 1
      from public.member_permissions p
      join public.account_members m
        on m.account_id = p.account_id and m.user_id = p.user_id
      where p.account_id = target_account
        and p.user_id = (select auth.uid())
        and p.permission = target_permission
        and m.status = 'active'
    );
$$;

create or replace function private.can_access_app(target_account uuid, target_app text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.account_apps aa
    where aa.account_id = target_account
      and aa.app_id = target_app
      and aa.status in ('trialing','active')
      and (
        private.is_account_owner(target_account)
        or exists (
          select 1 from public.member_app_access ma
          where ma.account_id = target_account
            and ma.user_id = (select auth.uid())
            and ma.app_id = target_app
        )
      )
  );
$$;

revoke all on function private.is_account_member(uuid) from public;
revoke all on function private.is_account_owner(uuid) from public;
revoke all on function private.has_account_permission(uuid, text) from public;
revoke all on function private.can_access_app(uuid, text) from public;
grant execute on function private.is_account_member(uuid) to authenticated;
grant execute on function private.is_account_owner(uuid) to authenticated;
grant execute on function private.has_account_permission(uuid, text) to authenticated;
grant execute on function private.can_access_app(uuid, text) to authenticated;

-- RLS ------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.account_members enable row level security;
alter table public.member_permissions enable row level security;
alter table public.apps enable row level security;
alter table public.plans enable row level security;
alter table public.account_apps enable row level security;
alter table public.member_app_access enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated
using ((select auth.uid()) = user_id);
create policy profiles_insert_own on public.profiles for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy profiles_update_own on public.profiles for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy accounts_select_member on public.accounts for select to authenticated
using (private.is_account_member(id));
create policy accounts_update_owner on public.accounts for update to authenticated
using (private.is_account_owner(id))
with check (private.is_account_owner(id));

create policy members_select_account on public.account_members for select to authenticated
using (private.is_account_member(account_id));
create policy members_insert_owner on public.account_members for insert to authenticated
with check (private.is_account_owner(account_id) and role = 'member');
create policy members_update_owner on public.account_members for update to authenticated
using (private.is_account_owner(account_id) and role <> 'owner')
with check (private.is_account_owner(account_id) and role <> 'owner');
create policy members_delete_owner on public.account_members for delete to authenticated
using (private.is_account_owner(account_id) and role <> 'owner');

create policy permissions_select_account on public.member_permissions for select to authenticated
using (private.is_account_member(account_id));
create policy permissions_manage_owner on public.member_permissions for all to authenticated
using (private.is_account_owner(account_id))
with check (private.is_account_owner(account_id));

create policy apps_public_read on public.apps for select to anon, authenticated using (status = 'active');
create policy plans_public_read on public.plans for select to anon, authenticated using (active = true);

create policy account_apps_select_member on public.account_apps for select to authenticated
using (private.is_account_member(account_id));

create policy member_app_access_select_account on public.member_app_access for select to authenticated
using (private.is_account_member(account_id));
create policy member_app_access_manage_owner on public.member_app_access for all to authenticated
using (private.is_account_owner(account_id))
with check (private.is_account_owner(account_id));

-- Data API grants explícitos (necessário com a política atual do Supabase).
grant select on public.apps, public.plans to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, update on public.accounts to authenticated;
grant select, insert, update, delete on public.account_members to authenticated;
grant select, insert, update, delete on public.member_permissions to authenticated;
grant select on public.account_apps to authenticated;
grant select, insert, update, delete on public.member_app_access to authenticated;

-- PERFIL AUTOMÁTICO -----------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(user_id, display_name)
  values (new.id, nullif(trim(coalesce(new.raw_user_meta_data->>'name','')), ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function private.handle_new_user();

-- CATÁLOGO INICIAL ------------------------------------------------------
insert into public.apps(id,name,category,status) values
  ('zeus','Zeus','Oficina','active'),
  ('artemis','Artemis','Restaurante','active'),
  ('kronos','Kronos','Vendas','active'),
  ('athena-orcamentos','Athena Orçamentos','Orçamentos','active'),
  ('athena-pesquisa','Athena Pesquisa','Pesquisa de satisfação','active')
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  status = excluded.status,
  updated_at = now();

insert into public.plans(app_id,billing_interval,amount_cents,currency) values
  ('zeus','monthly',5000,'brl'),('zeus','semiannual',25000,'brl'),('zeus','annual',50000,'brl'),
  ('artemis','monthly',5000,'brl'),('artemis','semiannual',25000,'brl'),('artemis','annual',50000,'brl'),
  ('kronos','monthly',5000,'brl'),('kronos','semiannual',25000,'brl'),('kronos','annual',50000,'brl'),
  ('athena-orcamentos','monthly',2000,'brl'),('athena-orcamentos','semiannual',10000,'brl'),('athena-orcamentos','annual',25000,'brl'),
  ('athena-pesquisa','monthly',2000,'brl'),('athena-pesquisa','semiannual',10000,'brl'),('athena-pesquisa','annual',25000,'brl')
on conflict (app_id,billing_interval) do update set
  amount_cents = excluded.amount_cents,
  currency = excluded.currency,
  updated_at = now();

-- Permissões previstas para a Store:
-- manage_configuration = alterar configurações dos apps liberados
-- manage_members       = reservado para futura delegação de gestão de usuários
-- manage_apps          = reservado para futura delegação de apps/acessos
-- manage_billing       = reservado para assinatura/faturamento
-- Nesta primeira regra, somente o owner concede/remova permissões.
