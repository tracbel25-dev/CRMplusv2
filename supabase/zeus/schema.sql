-- CRM PLUS Store — Zeus
-- Projeto Supabase exclusivo: diejjfzvoopcuqulqkqr
-- URL: https://diejjfzvoopcuqulqkqr.supabase.co
--
-- Snapshot canônico para bootstrap/revisão do banco operacional do Zeus.
-- NÃO executar no Supabase central da CRM PLUS Store nem no projeto Artemis.
-- A produção usa o histórico de migrations do próprio projeto Supabase.

create table if not exists public.tenants (
  tenant_key text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_key_not_blank check (length(trim(tenant_key)) > 0)
);

create table if not exists public.tenant_settings (
  tenant_key text primary key references public.tenants(tenant_key) on delete cascade,
  business text not null default '',
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  operator_name text not null default '',
  identifier_label text not null default 'Placa',
  asset_label text not null default 'Veículo',
  meter_label text not null default 'Quilometragem',
  budget_enabled boolean not null default true,
  schedule_enabled boolean not null default true,
  diagnosis_enabled boolean not null default true,
  budget_validity_days smallint not null default 7 check (budget_validity_days between 1 and 365),
  job_filters text[] not null default array['Status','Etapa','Tipo','Responsável','Cliente']::text[],
  quote_filters text[] not null default array['Origem','Status','Cliente','Validade']::text[],
  dashboard_filters text[] not null default array['Status','Etapa','Tipo','Responsável']::text[],
  service_types text[] not null default array['Diagnóstico','Revisão','Reparo','Retorno / Garantia']::text[],
  field_labels jsonb not null default '{}'::jsonb,
  field_visibility jsonb not null default '{}'::jsonb,
  action_visibility jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  tenant_key text not null references public.tenants(tenant_key) on delete cascade,
  name text not null,
  phone text not null default '',
  email text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_name_not_blank check (length(trim(name)) > 0),
  unique (tenant_key, id)
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  tenant_key text not null references public.tenants(tenant_key) on delete cascade,
  customer_id uuid not null,
  identifier text not null,
  model text not null,
  year text not null default '',
  meter text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assets_identifier_not_blank check (length(trim(identifier)) > 0),
  constraint assets_model_not_blank check (length(trim(model)) > 0),
  unique (tenant_key, id),
  unique (tenant_key, id, customer_id),
  unique (tenant_key, identifier),
  foreign key (tenant_key, customer_id) references public.customers(tenant_key, id) on delete restrict
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_key text not null references public.tenants(tenant_key) on delete cascade,
  number bigint not null,
  customer_id uuid not null,
  asset_id uuid not null,
  type text not null,
  stage text not null default 'Identificação',
  status text not null default 'Em andamento',
  technician text not null default '',
  due timestamptz,
  complaint text not null,
  diagnosis text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_number_positive check (number > 0),
  constraint jobs_type_not_blank check (length(trim(type)) > 0),
  constraint jobs_complaint_not_blank check (length(trim(complaint)) > 0),
  unique (tenant_key, id),
  unique (tenant_key, number),
  foreign key (tenant_key, customer_id) references public.customers(tenant_key, id) on delete restrict,
  foreign key (tenant_key, asset_id, customer_id) references public.assets(tenant_key, id, customer_id) on delete restrict
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_key text not null references public.tenants(tenant_key) on delete cascade,
  customer_id uuid not null,
  asset_id uuid not null,
  at timestamptz not null,
  type text not null,
  technician text not null default '',
  notes text not null default '',
  status text not null default 'Agendado' check (status in ('Agendado','Iniciado','Cancelado')),
  job_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_key, id),
  foreign key (tenant_key, customer_id) references public.customers(tenant_key, id) on delete restrict,
  foreign key (tenant_key, asset_id, customer_id) references public.assets(tenant_key, id, customer_id) on delete restrict,
  foreign key (tenant_key, job_id) references public.jobs(tenant_key, id) on delete restrict
);

create table if not exists public.job_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_key text not null references public.tenants(tenant_key) on delete cascade,
  job_id uuid not null,
  description text not null,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_key, id),
  foreign key (tenant_key, job_id) references public.jobs(tenant_key, id) on delete cascade
);

create table if not exists public.job_events (
  id uuid primary key default gen_random_uuid(),
  tenant_key text not null references public.tenants(tenant_key) on delete cascade,
  job_id uuid not null,
  at timestamptz not null default now(),
  text text not null,
  event_type text not null default 'note',
  stage text,
  metadata jsonb not null default '{}'::jsonb,
  foreign key (tenant_key, job_id) references public.jobs(tenant_key, id) on delete cascade
);

create table if not exists public.job_attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_key text not null references public.tenants(tenant_key) on delete cascade,
  job_id uuid not null,
  name text not null,
  storage_key text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  created_at timestamptz not null default now(),
  unique (tenant_key, storage_key),
  foreign key (tenant_key, job_id) references public.jobs(tenant_key, id) on delete cascade
);

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_key text not null references public.tenants(tenant_key) on delete cascade,
  job_id uuid,
  number bigint not null,
  customer_id uuid not null,
  title text not null default '',
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  valid_until date,
  notes text not null default '',
  status text not null default 'Rascunho' check (status in ('Rascunho','Enviado','Aprovado','Reprovado','Expirado')),
  version integer not null default 1 check (version >= 1),
  decision_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quotes_number_positive check (number > 0),
  unique (tenant_key, id),
  unique (tenant_key, job_id),
  foreign key (tenant_key, customer_id) references public.customers(tenant_key, id) on delete restrict,
  foreign key (tenant_key, job_id) references public.jobs(tenant_key, id) on delete cascade
);

create table if not exists public.quote_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_key text not null references public.tenants(tenant_key) on delete cascade,
  quote_id uuid not null,
  position integer not null default 0 check (position >= 0),
  kind text not null check (kind in ('Serviço','Peça')),
  description text not null,
  brand text not null default '',
  quantity numeric not null check (quantity > 0),
  price_cents bigint not null check (price_cents >= 0),
  unique (tenant_key, id),
  foreign key (tenant_key, quote_id) references public.quotes(tenant_key, id) on delete cascade
);

create table if not exists public.quote_events (
  id uuid primary key default gen_random_uuid(),
  tenant_key text not null references public.tenants(tenant_key) on delete cascade,
  quote_id uuid not null,
  at timestamptz not null default now(),
  text text not null,
  foreign key (tenant_key, quote_id) references public.quotes(tenant_key, id) on delete cascade
);

create table if not exists public.quote_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_key text not null references public.tenants(tenant_key) on delete cascade,
  quote_id uuid not null,
  version integer not null check (version >= 1),
  status text not null,
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  valid_until date,
  notes text not null default '',
  decision_note text,
  archived_at timestamptz not null default now(),
  unique (tenant_key, id),
  unique (tenant_key, quote_id, version),
  foreign key (tenant_key, quote_id) references public.quotes(tenant_key, id) on delete cascade
);

create table if not exists public.quote_version_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_key text not null references public.tenants(tenant_key) on delete cascade,
  quote_version_id uuid not null,
  position integer not null default 0 check (position >= 0),
  kind text not null check (kind in ('Serviço','Peça')),
  description text not null,
  brand text not null default '',
  quantity numeric not null check (quantity > 0),
  price_cents bigint not null check (price_cents >= 0),
  foreign key (tenant_key, quote_version_id) references public.quote_versions(tenant_key, id) on delete cascade
);

create table if not exists public.custom_fields (
  id uuid primary key default gen_random_uuid(),
  tenant_key text not null references public.tenants(tenant_key) on delete cascade,
  label text not null,
  group_name text not null,
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custom_fields_label_not_blank check (length(trim(label)) > 0),
  unique (tenant_key, id)
);

create table if not exists public.custom_field_values (
  tenant_key text not null references public.tenants(tenant_key) on delete cascade,
  field_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  value text not null default '',
  updated_at timestamptz not null default now(),
  primary key (tenant_key, field_id, entity_type, entity_id),
  foreign key (tenant_key, field_id) references public.custom_fields(tenant_key, id) on delete cascade
);

create index if not exists customers_tenant_name_idx on public.customers (tenant_key, name);
create index if not exists assets_tenant_customer_idx on public.assets (tenant_key, customer_id);
create index if not exists jobs_tenant_status_stage_idx on public.jobs (tenant_key, status, stage);
create index if not exists jobs_tenant_created_idx on public.jobs (tenant_key, created_at desc);
create index if not exists jobs_tenant_due_idx on public.jobs (tenant_key, due) where due is not null;
create index if not exists jobs_tenant_customer_idx on public.jobs (tenant_key, customer_id);
create index if not exists jobs_tenant_asset_idx on public.jobs (tenant_key, asset_id);
create index if not exists jobs_tenant_asset_customer_idx on public.jobs (tenant_key, asset_id, customer_id);
create index if not exists appointments_tenant_at_idx on public.appointments (tenant_key, at);
create index if not exists appointments_tenant_status_at_idx on public.appointments (tenant_key, status, at);
create index if not exists appointments_tenant_customer_idx on public.appointments (tenant_key, customer_id);
create index if not exists appointments_tenant_asset_customer_idx on public.appointments (tenant_key, asset_id, customer_id);
create index if not exists appointments_tenant_job_idx on public.appointments (tenant_key, job_id) where job_id is not null;
create index if not exists job_tasks_tenant_job_done_idx on public.job_tasks (tenant_key, job_id, done);
create index if not exists job_events_tenant_job_at_idx on public.job_events (tenant_key, job_id, at);
create index if not exists job_attachments_tenant_job_idx on public.job_attachments (tenant_key, job_id);
create index if not exists quotes_tenant_customer_idx on public.quotes (tenant_key, customer_id);
create index if not exists quotes_tenant_status_validity_idx on public.quotes (tenant_key, status, valid_until);
create unique index if not exists quotes_counter_number_uq on public.quotes (tenant_key, number) where job_id is null;
create index if not exists quote_lines_tenant_quote_position_idx on public.quote_lines (tenant_key, quote_id, position);
create index if not exists quote_events_tenant_quote_at_idx on public.quote_events (tenant_key, quote_id, at);
create index if not exists quote_versions_tenant_quote_idx on public.quote_versions (tenant_key, quote_id, version desc);
create index if not exists quote_version_lines_tenant_version_position_idx on public.quote_version_lines (tenant_key, quote_version_id, position);
create index if not exists custom_field_values_entity_idx on public.custom_field_values (tenant_key, entity_type, entity_id);

alter table public.tenants enable row level security;
alter table public.tenant_settings enable row level security;
alter table public.customers enable row level security;
alter table public.assets enable row level security;
alter table public.jobs enable row level security;
alter table public.appointments enable row level security;
alter table public.job_tasks enable row level security;
alter table public.job_events enable row level security;
alter table public.job_attachments enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_lines enable row level security;
alter table public.quote_events enable row level security;
alter table public.quote_versions enable row level security;
alter table public.quote_version_lines enable row level security;
alter table public.custom_fields enable row level security;
alter table public.custom_field_values enable row level security;

-- O frontend ainda autentica na Store central. Até a ponte segura de tenant existir,
-- o Data API operacional não é aberto para anon/authenticated.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated;

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Novos objetos também devem nascer fechados por padrão.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public;
