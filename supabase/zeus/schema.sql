-- CRM PLUS Store — Zeus
-- Projeto Supabase exclusivo: diejjfzvoopcuqulqkqr
-- URL: https://diejjfzvoopcuqulqkqr.supabase.co
--
-- BASE de bootstrap do banco operacional do Zeus.
-- Em uma instalação nova execute este arquivo primeiro e, em seguida, TODAS as migrations
-- de supabase/zeus/migrations em ordem de timestamp. O estado final esperado é a soma
-- deste baseline + migrations; produção continua tendo o histórico de migrations como fonte de verdade.
-- NÃO executar no Supabase central da CRM PLUS Store nem no projeto Artemis.

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
  field_help jsonb not null default '{}'::jsonb,
  filter_labels jsonb not null default '{}'::jsonb,
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
  unique (tenant_key, id),
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

-- Estado canônico usado pelo frontend cloud do Zeus. As tabelas acima são a projeção operacional normalizada.
create table if not exists public.workspace_state (
  tenant_key text primary key references public.tenants(tenant_key) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  data jsonb not null default '{}'::jsonb,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Faturamento é derivado quando a OS é encerrada, mas fica separado da OS depois do fechamento.
create table if not exists public.billing_records (
  id uuid primary key default gen_random_uuid(),
  tenant_key text not null references public.tenants(tenant_key) on delete cascade,
  job_id uuid not null,
  job_number bigint not null,
  customer_id uuid not null,
  amount_cents bigint not null default 0 check (amount_cents >= 0),
  status text not null default 'Pendente' check (status in ('Pendente','Pago','Baixado','Cancelado')),
  payment_method text not null default '',
  payment_provider text not null default '',
  provider_reference text not null default '',
  paid_at timestamptz,
  closed_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_key, id),
  unique (tenant_key, job_id),
  foreign key (tenant_key, job_id) references public.jobs(tenant_key, id) on delete restrict,
  foreign key (tenant_key, customer_id) references public.customers(tenant_key, id) on delete restrict
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
create index if not exists billing_records_tenant_customer_idx on public.billing_records (tenant_key, customer_id, created_at desc);
create index if not exists billing_records_tenant_status_idx on public.billing_records (tenant_key, status, created_at desc);

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
alter table public.workspace_state enable row level security;
alter table public.billing_records enable row level security;

-- O frontend autentica na Store central; o navegador não recebe CRUD direto no banco operacional.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated;

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Projeta o workspace JSON nas tabelas operacionais. A função é deliberadamente idempotente/upsert.
create or replace function public.sync_zeus_workspace(p_tenant_key text, p_data jsonb)
returns void
language plpgsql
set search_path to 'public'
as $$
declare
  s jsonb := coalesce(p_data->'settings', '{}'::jsonb);
  prefs jsonb := coalesce(p_data->'settings'->'operationPreferences', '{}'::jsonb);
  j jsonb;
  q jsonb;
  item jsonb;
  idx integer;
  v_job_id uuid;
  v_quote_id uuid;
  v_customer_id uuid;
  v_amount bigint;
begin
  if p_tenant_key is null or length(trim(p_tenant_key)) = 0 then raise exception 'tenant_key_required'; end if;
  if jsonb_typeof(p_data) <> 'object' then raise exception 'workspace_data_invalid'; end if;

  insert into public.tenants(tenant_key, updated_at)
  values (p_tenant_key, now())
  on conflict (tenant_key) do update set updated_at=excluded.updated_at;

  insert into public.tenant_settings(
    tenant_key,business,phone,email,address,operator_name,identifier_label,asset_label,meter_label,
    budget_enabled,schedule_enabled,diagnosis_enabled,field_labels,field_visibility,action_visibility,field_help,updated_at
  ) values (
    p_tenant_key,coalesce(s->>'business',''),coalesce(s->>'phone',''),coalesce(s->>'email',''),coalesce(s->>'address',''),coalesce(s->>'operator',''),
    coalesce(nullif(s->>'identifierLabel',''),'Placa'),coalesce(nullif(s->>'assetLabel',''),'Veículo'),coalesce(nullif(s->>'meterLabel',''),'Quilometragem'),
    coalesce((s->>'budgetEnabled')::boolean,true),coalesce((s->>'scheduleEnabled')::boolean,true),coalesce((s->>'diagnosisEnabled')::boolean,true),
    coalesce(prefs->'fieldLabels','{}'::jsonb),coalesce(prefs->'fieldVisibility','{}'::jsonb),coalesce(prefs->'actionVisibility','{}'::jsonb),coalesce(prefs->'fieldHelp','{}'::jsonb),now()
  ) on conflict (tenant_key) do update set
    business=excluded.business,phone=excluded.phone,email=excluded.email,address=excluded.address,operator_name=excluded.operator_name,
    identifier_label=excluded.identifier_label,asset_label=excluded.asset_label,meter_label=excluded.meter_label,
    budget_enabled=excluded.budget_enabled,schedule_enabled=excluded.schedule_enabled,diagnosis_enabled=excluded.diagnosis_enabled,
    field_labels=excluded.field_labels,field_visibility=excluded.field_visibility,action_visibility=excluded.action_visibility,field_help=excluded.field_help,updated_at=now();

  for item in select value from jsonb_array_elements(coalesce(p_data->'customers','[]'::jsonb)) loop
    insert into public.customers(id,tenant_key,name,phone,email,notes,created_at,updated_at)
    values ((item->>'id')::uuid,p_tenant_key,coalesce(nullif(item->>'name',''),'Cliente'),coalesce(item->>'phone',''),coalesce(item->>'email',''),coalesce(item->>'notes',''),coalesce(nullif(item->>'createdAt','')::timestamptz,now()),now())
    on conflict (tenant_key,id) do update set name=excluded.name,phone=excluded.phone,email=excluded.email,notes=excluded.notes,updated_at=now();
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_data->'assets','[]'::jsonb)) loop
    insert into public.assets(id,tenant_key,customer_id,identifier,model,year,meter,updated_at)
    values ((item->>'id')::uuid,p_tenant_key,(item->>'customerId')::uuid,coalesce(nullif(item->>'identifier',''),'Sem identificação'),coalesce(nullif(item->>'model',''),'Não informado'),coalesce(item->>'year',''),coalesce(item->>'meter',''),now())
    on conflict (tenant_key,id) do update set customer_id=excluded.customer_id,identifier=excluded.identifier,model=excluded.model,year=excluded.year,meter=excluded.meter,updated_at=now();
  end loop;

  for j in select value from jsonb_array_elements(coalesce(p_data->'jobs','[]'::jsonb)) loop
    v_job_id := (j->>'id')::uuid;
    v_customer_id := (j->>'customerId')::uuid;
    insert into public.jobs(id,tenant_key,number,customer_id,asset_id,type,stage,status,technician,due,complaint,diagnosis,notes,created_at,updated_at)
    values (
      v_job_id,p_tenant_key,greatest(1,coalesce((j->>'number')::bigint,1)),v_customer_id,(j->>'assetId')::uuid,
      coalesce(nullif(j->>'type',''),'Diagnóstico'),coalesce(nullif(j->>'stage',''),'Identificação'),coalesce(nullif(j->>'status',''),'Em andamento'),coalesce(j->>'technician',''),
      case when nullif(j->>'due','') is null then null else (j->>'due')::timestamptz end,
      coalesce(nullif(j->>'complaint',''),'Sem relato'),coalesce(j->>'diagnosis',''),coalesce(j->>'notes',''),coalesce(nullif(j->>'createdAt','')::timestamptz,now()),now()
    ) on conflict (tenant_key,id) do update set
      number=excluded.number,customer_id=excluded.customer_id,asset_id=excluded.asset_id,type=excluded.type,stage=excluded.stage,status=excluded.status,
      technician=excluded.technician,due=excluded.due,complaint=excluded.complaint,diagnosis=excluded.diagnosis,notes=excluded.notes,updated_at=now();

    for item in select value from jsonb_array_elements(coalesce(j->'tasks','[]'::jsonb)) loop
      insert into public.job_tasks(id,tenant_key,job_id,description,done,updated_at)
      values ((item->>'id')::uuid,p_tenant_key,v_job_id,coalesce(nullif(item->>'description',''),'Tarefa'),coalesce((item->>'done')::boolean,false),now())
      on conflict (tenant_key,id) do update set description=excluded.description,done=excluded.done,updated_at=now();
    end loop;

    for item in select value from jsonb_array_elements(coalesce(j->'events','[]'::jsonb)) loop
      insert into public.job_events(id,tenant_key,job_id,at,text)
      values ((item->>'id')::uuid,p_tenant_key,v_job_id,coalesce(nullif(item->>'at','')::timestamptz,now()),coalesce(nullif(item->>'text',''),'Atualização'))
      on conflict (id) do update set at=excluded.at,text=excluded.text where job_events.tenant_key=p_tenant_key;
    end loop;

    for item in select value from jsonb_array_elements(coalesce(j->'attachments','[]'::jsonb)) loop
      if coalesce(item->>'data','') like 'r2:%' then
        insert into public.job_attachments(id,tenant_key,job_id,name,storage_key)
        values ((item->>'id')::uuid,p_tenant_key,v_job_id,coalesce(nullif(item->>'name',''),'Arquivo'),split_part(substr(item->>'data',4),'|',1))
        on conflict (tenant_key,id) do update set name=excluded.name,storage_key=excluded.storage_key;
      end if;
    end loop;

    q := coalesce(j->'quote','{}'::jsonb);
    if q ? 'id' then
      v_quote_id := (q->>'id')::uuid;
      insert into public.quotes(id,tenant_key,job_id,number,customer_id,title,discount_cents,valid_until,notes,status,version,decision_at,decision_note,created_at,updated_at)
      values (
        v_quote_id,p_tenant_key,v_job_id,greatest(1,coalesce((q->>'number')::bigint,(j->>'number')::bigint,1)),v_customer_id,
        coalesce(q->>'title',''),greatest(0,coalesce((q->>'discount')::bigint,0)),case when nullif(q->>'validUntil','') is null then null else (q->>'validUntil')::date end,
        coalesce(q->>'notes',''),coalesce(nullif(q->>'status',''),'Rascunho'),greatest(1,coalesce((q->>'version')::int,1)),
        case when nullif(q->>'decisionAt','') is null then null else (q->>'decisionAt')::timestamptz end,nullif(q->>'decisionNote',''),coalesce(nullif(q->>'createdAt','')::timestamptz,now()),now()
      ) on conflict (tenant_key,id) do update set
        job_id=excluded.job_id,number=excluded.number,customer_id=excluded.customer_id,title=excluded.title,discount_cents=excluded.discount_cents,
        valid_until=excluded.valid_until,notes=excluded.notes,status=excluded.status,version=excluded.version,decision_at=excluded.decision_at,decision_note=excluded.decision_note,updated_at=now();

      idx := 0;
      for item in select value from jsonb_array_elements(coalesce(q->'lines','[]'::jsonb)) loop
        insert into public.quote_lines(id,tenant_key,quote_id,position,kind,description,brand,quantity,price_cents)
        values ((item->>'id')::uuid,p_tenant_key,v_quote_id,idx,case when item->>'kind'='Peça' then 'Peça' else 'Serviço' end,coalesce(nullif(item->>'description',''),'Item'),coalesce(item->>'brand',''),greatest(0.01,coalesce((item->>'quantity')::numeric,1)),greatest(0,coalesce((item->>'price')::bigint,0)))
        on conflict (tenant_key,id) do update set position=excluded.position,kind=excluded.kind,description=excluded.description,brand=excluded.brand,quantity=excluded.quantity,price_cents=excluded.price_cents;
        idx := idx + 1;
      end loop;

      for item in select value from jsonb_array_elements(coalesce(q->'events','[]'::jsonb)) loop
        insert into public.quote_events(id,tenant_key,quote_id,at,text)
        values ((item->>'id')::uuid,p_tenant_key,v_quote_id,coalesce(nullif(item->>'at','')::timestamptz,now()),coalesce(nullif(item->>'text',''),'Atualização'))
        on conflict (id) do update set at=excluded.at,text=excluded.text where quote_events.tenant_key=p_tenant_key;
      end loop;
    end if;

    if j->>'status' = 'Encerrado' then
      select greatest(0,coalesce(sum(greatest(0,coalesce((line->>'price')::bigint,0))*greatest(0.01,coalesce((line->>'quantity')::numeric,1))),0)::bigint-greatest(0,coalesce((q->>'discount')::bigint,0)))
        into v_amount
        from jsonb_array_elements(coalesce(q->'lines','[]'::jsonb)) line;
      insert into public.billing_records(tenant_key,job_id,job_number,customer_id,amount_cents,status,created_at,updated_at)
      values (p_tenant_key,v_job_id,greatest(1,coalesce((j->>'number')::bigint,1)),v_customer_id,coalesce(v_amount,0),'Pendente',now(),now())
      on conflict (tenant_key,job_id) do update set job_number=excluded.job_number,customer_id=excluded.customer_id,amount_cents=case when billing_records.status='Pendente' then excluded.amount_cents else billing_records.amount_cents end,updated_at=now();
    end if;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_data->'appointments','[]'::jsonb)) loop
    insert into public.appointments(id,tenant_key,customer_id,asset_id,at,type,technician,notes,status,job_id,updated_at)
    values (
      (item->>'id')::uuid,p_tenant_key,(item->>'customerId')::uuid,(item->>'assetId')::uuid,(item->>'at')::timestamptz,
      coalesce(nullif(item->>'type',''),'Diagnóstico'),coalesce(item->>'technician',''),coalesce(item->>'notes',''),
      case when item->>'status' in ('Agendado','Iniciado','Cancelado') then item->>'status' else 'Agendado' end,
      case when nullif(item->>'jobId','') is null then null else (item->>'jobId')::uuid end,now()
    ) on conflict (tenant_key,id) do update set customer_id=excluded.customer_id,asset_id=excluded.asset_id,at=excluded.at,type=excluded.type,technician=excluded.technician,notes=excluded.notes,status=excluded.status,job_id=excluded.job_id,updated_at=now();
  end loop;

  for q in select value from jsonb_array_elements(coalesce(p_data->'quotes','[]'::jsonb)) loop
    v_quote_id := (q->>'id')::uuid;
    v_customer_id := (q->>'customerId')::uuid;
    insert into public.quotes(id,tenant_key,job_id,number,customer_id,title,discount_cents,valid_until,notes,status,version,decision_at,decision_note,created_at,updated_at)
    values (v_quote_id,p_tenant_key,null,greatest(1,coalesce((q->>'number')::bigint,1)),v_customer_id,coalesce(q->>'title',''),greatest(0,coalesce((q->>'discount')::bigint,0)),case when nullif(q->>'validUntil','') is null then null else (q->>'validUntil')::date end,coalesce(q->>'notes',''),coalesce(nullif(q->>'status',''),'Rascunho'),greatest(1,coalesce((q->>'version')::int,1)),case when nullif(q->>'decisionAt','') is null then null else (q->>'decisionAt')::timestamptz end,nullif(q->>'decisionNote',''),coalesce(nullif(q->>'createdAt','')::timestamptz,now()),now())
    on conflict (tenant_key,id) do update set number=excluded.number,customer_id=excluded.customer_id,title=excluded.title,discount_cents=excluded.discount_cents,valid_until=excluded.valid_until,notes=excluded.notes,status=excluded.status,version=excluded.version,decision_at=excluded.decision_at,decision_note=excluded.decision_note,updated_at=now();
  end loop;

  for item in select value from jsonb_array_elements(coalesce(prefs->'customFields','[]'::jsonb)) loop
    insert into public.custom_fields(id,tenant_key,label,group_name,visible,updated_at)
    values ((item->>'id')::uuid,p_tenant_key,coalesce(nullif(item->>'label',''),'Campo'),coalesce(nullif(item->>'group',''),'Atendimento'),coalesce((item->>'visible')::boolean,true),now())
    on conflict (tenant_key,id) do update set label=excluded.label,group_name=excluded.group_name,visible=excluded.visible,updated_at=now();
  end loop;
end;
$$;

revoke execute on function public.sync_zeus_workspace(text,jsonb) from public,anon,authenticated;
grant execute on function public.sync_zeus_workspace(text,jsonb) to service_role;

-- Novos objetos também devem nascer fechados por padrão.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public;
