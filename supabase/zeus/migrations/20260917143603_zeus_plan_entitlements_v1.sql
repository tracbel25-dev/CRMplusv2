create table if not exists public.tenant_entitlements (
  tenant_key text primary key references public.tenants(tenant_key) on delete cascade,
  plan_code text not null default 'start' check (plan_code in ('start','essencial','plus','premium')),
  seat_limit smallint generated always as (
    case plan_code when 'start' then 1 when 'essencial' then 2 when 'plus' then 4 when 'premium' then 10 else 1 end
  ) stored,
  ai_enabled boolean not null default true check (ai_enabled = true),
  ai_monthly_limit integer null check (ai_monthly_limit is null or ai_monthly_limit > 0),
  source text not null default 'store',
  updated_at timestamptz not null default now()
);

alter table public.tenant_entitlements enable row level security;
revoke all on table public.tenant_entitlements from public, anon, authenticated;
grant select, insert, update, delete on table public.tenant_entitlements to service_role;

insert into public.tenant_entitlements (tenant_key, plan_code, source)
select tenant_key, 'premium', 'migration_preserve_existing'
from public.tenants
on conflict (tenant_key) do nothing;

comment on table public.tenant_entitlements is 'Espelho operacional do plano comercial do Zeus. O Store corporativo deve sincronizar plan_code; downgrade nunca apaga dados operacionais.';
comment on column public.tenant_entitlements.ai_monthly_limit is 'Reservado para limite futuro de uso de IA. NULL significa sem limite comercial aplicado.';
