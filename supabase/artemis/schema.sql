-- CRM PLUS Store — Artemis
-- Projeto Supabase exclusivo: sqbjqjjnusmqotlkegyt
-- URL: https://sqbjqjjnusmqotlkegyt.supabase.co
--
-- Snapshot canônico para bootstrap/revisão do banco operacional do Artemis.
-- NÃO executar no Supabase central da CRM PLUS Store nem no projeto Zeus.
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
  online_paused boolean not null default false,
  delivery_fee_cents bigint not null default 0 check (delivery_fee_cents >= 0),
  minimum_order_cents bigint not null default 0 check (minimum_order_cents >= 0),
  delivery_areas text not null default '',
  hours text not null default '',
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

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  tenant_key text not null references public.tenants(tenant_key) on delete cascade,
  name text not null,
  description text not null default '',
  category text not null,
  price_cents bigint not null check (price_cents >= 0),
  available boolean not null default true,
  stock_controlled boolean not null default false,
  stock numeric not null default 0 check (stock >= 0),
  minimum_stock numeric not null default 0 check (minimum_stock >= 0),
  allergens text not null default '',
  preparation_minutes integer not null default 0 check (preparation_minutes >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_name_not_blank check (length(trim(name)) > 0),
  constraint products_category_not_blank check (length(trim(category)) > 0),
  unique (tenant_key, id)
);

create table if not exists public.restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  tenant_key text not null references public.tenants(tenant_key) on delete cascade,
  name text not null,
  seats integer not null default 1 check (seats > 0),
  opened_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_tables_name_not_blank check (length(trim(name)) > 0),
  unique (tenant_key, id),
  unique (tenant_key, name)
);

create table if not exists public.cash_shifts (
  id uuid primary key default gen_random_uuid(),
  tenant_key text not null references public.tenants(tenant_key) on delete cascade,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  initial_cents bigint not null default 0 check (initial_cents >= 0),
  counted_cents bigint not null default 0 check (counted_cents >= 0),
  note text not null default '',
  operator_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cash_shifts_operator_not_blank check (length(trim(operator_name)) > 0),
  unique (tenant_key, id)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_key text not null references public.tenants(tenant_key) on delete cascade,
  number bigint not null,
  customer_id uuid,
  customer_name text not null default '',
  phone text not null default '',
  address text not null default '',
  channel text not null check (channel in ('Mesa','Balcão','Delivery','Retirada')),
  table_id uuid,
  table_session_started_at timestamptz,
  notes text not null default '',
  status text not null default 'Novo' check (status in ('Novo','Aceito','Em preparo','Pronto','Concluído','Cancelado')),
  delivery_status text not null default '',
  fee_cents bigint not null default 0 check (fee_cents >= 0),
  discount_cents bigint not null default 0 check (discount_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  stock_consumed boolean not null default false,
  reserved boolean not null default false,
  cancel_reason text,
  constraint orders_number_positive check (number > 0),
  constraint orders_table_requires_table check (channel <> 'Mesa' or table_id is not null),
  constraint orders_delivery_requires_address check (channel <> 'Delivery' or length(trim(address)) > 0),
  unique (tenant_key, id),
  unique (tenant_key, number),
  foreign key (tenant_key, customer_id) references public.customers(tenant_key, id) on delete restrict,
  foreign key (tenant_key, table_id) references public.restaurant_tables(tenant_key, id) on delete restrict
);

create table if not exists public.order_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_key text not null references public.tenants(tenant_key) on delete cascade,
  order_id uuid not null,
  product_id uuid,
  position integer not null default 0 check (position >= 0),
  description text not null,
  quantity numeric not null check (quantity > 0),
  price_cents bigint not null check (price_cents >= 0),
  done boolean not null default false,
  note text not null default '',
  prep_minutes integer not null default 0 check (prep_minutes >= 0),
  unique (tenant_key, id),
  foreign key (tenant_key, order_id) references public.orders(tenant_key, id) on delete cascade,
  foreign key (tenant_key, product_id) references public.products(tenant_key, id) on delete restrict
);

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  tenant_key text not null references public.tenants(tenant_key) on delete cascade,
  order_id uuid not null,
  at timestamptz not null default now(),
  text text not null,
  event_type text not null default 'note',
  metadata jsonb not null default '{}'::jsonb,
  foreign key (tenant_key, order_id) references public.orders(tenant_key, id) on delete cascade
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_key text not null references public.tenants(tenant_key) on delete cascade,
  order_id uuid not null,
  shift_id uuid not null,
  amount_cents bigint not null check (amount_cents > 0),
  method text not null,
  at timestamptz not null default now(),
  refunded_cents bigint not null default 0,
  constraint payments_refund_check check (refunded_cents >= 0 and refunded_cents <= amount_cents),
  unique (tenant_key, id),
  foreign key (tenant_key, order_id) references public.orders(tenant_key, id) on delete restrict,
  foreign key (tenant_key, shift_id) references public.cash_shifts(tenant_key, id) on delete restrict
);

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_key text not null references public.tenants(tenant_key) on delete cascade,
  shift_id uuid not null,
  kind text not null check (kind in ('Suprimento','Sangria','Despesa','Devolução')),
  amount_cents bigint not null check (amount_cents > 0),
  note text not null,
  at timestamptz not null default now(),
  method text,
  unique (tenant_key, id),
  foreign key (tenant_key, shift_id) references public.cash_shifts(tenant_key, id) on delete restrict
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_key text not null references public.tenants(tenant_key) on delete cascade,
  product_id uuid not null,
  amount numeric not null check (amount <> 0),
  note text not null,
  at timestamptz not null default now(),
  unique (tenant_key, id),
  foreign key (tenant_key, product_id) references public.products(tenant_key, id) on delete restrict
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
create index if not exists products_tenant_category_available_idx on public.products (tenant_key, category, available);
create index if not exists products_tenant_stock_idx on public.products (tenant_key, stock_controlled, stock, minimum_stock);
create index if not exists restaurant_tables_tenant_open_idx on public.restaurant_tables (tenant_key, opened_at) where opened_at is not null;
create unique index if not exists cash_shifts_one_open_per_tenant_uq on public.cash_shifts (tenant_key) where closed_at is null;
create index if not exists cash_shifts_tenant_opened_idx on public.cash_shifts (tenant_key, opened_at desc);
create index if not exists orders_tenant_status_created_idx on public.orders (tenant_key, status, created_at desc);
create index if not exists orders_tenant_channel_created_idx on public.orders (tenant_key, channel, created_at desc);
create index if not exists orders_tenant_customer_idx on public.orders (tenant_key, customer_id) where customer_id is not null;
create index if not exists orders_tenant_table_session_idx on public.orders (tenant_key, table_id, table_session_started_at) where table_id is not null;
create index if not exists order_lines_tenant_order_position_idx on public.order_lines (tenant_key, order_id, position);
create index if not exists order_lines_tenant_product_idx on public.order_lines (tenant_key, product_id) where product_id is not null;
create index if not exists order_events_tenant_order_at_idx on public.order_events (tenant_key, order_id, at);
create index if not exists payments_tenant_shift_at_idx on public.payments (tenant_key, shift_id, at);
create index if not exists payments_tenant_order_idx on public.payments (tenant_key, order_id);
create index if not exists cash_movements_tenant_shift_at_idx on public.cash_movements (tenant_key, shift_id, at);
create index if not exists stock_movements_tenant_product_at_idx on public.stock_movements (tenant_key, product_id, at desc);
create index if not exists custom_field_values_entity_idx on public.custom_field_values (tenant_key, entity_type, entity_id);

alter table public.tenants enable row level security;
alter table public.tenant_settings enable row level security;
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.restaurant_tables enable row level security;
alter table public.cash_shifts enable row level security;
alter table public.orders enable row level security;
alter table public.order_lines enable row level security;
alter table public.order_events enable row level security;
alter table public.payments enable row level security;
alter table public.cash_movements enable row level security;
alter table public.stock_movements enable row level security;
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
