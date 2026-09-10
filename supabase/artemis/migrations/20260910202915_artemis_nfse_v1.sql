create table if not exists public.fiscal_profiles (
  tenant_key text primary key references public.tenants(tenant_key) on delete cascade,
  cnpj text not null default '',
  municipal_registration text not null default '',
  municipality_ibge text not null default '',
  tax_regime text not null default '',
  dps_series text not null default '1',
  provider text not null default 'national' check (provider in ('national','municipal')),
  municipal_provider_key text not null default '',
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.service_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_key text not null references public.tenants(tenant_key) on delete cascade,
  order_id uuid,
  customer_name text not null,
  customer_document text not null default '',
  customer_email text not null default '',
  service_code text not null,
  description text not null,
  amount_cents bigint not null check (amount_cents > 0),
  status text not null default 'draft' check (status in ('draft','pending_configuration','submitted','authorized','rejected','cancelled')),
  provider text not null default 'national',
  provider_reference text,
  access_key text,
  invoice_number text,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  error_message text,
  issued_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_key, id)
);

create index if not exists service_invoices_tenant_created_idx on public.service_invoices (tenant_key, created_at desc);
create index if not exists service_invoices_tenant_order_idx on public.service_invoices (tenant_key, order_id) where order_id is not null;

alter table public.fiscal_profiles enable row level security;
alter table public.service_invoices enable row level security;

revoke all on public.fiscal_profiles, public.service_invoices from anon, authenticated;
grant select, insert, update, delete on public.fiscal_profiles, public.service_invoices to service_role;
