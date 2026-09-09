-- Memória de IA isolada do Artemis.
-- Acesso somente server-side via service_role/secret key.

create table if not exists public.ai_interactions (
  id uuid primary key default gen_random_uuid(),
  tenant_key text not null references public.tenants(tenant_key) on delete cascade,
  user_id text not null default '',
  function_name text not null check (length(trim(function_name)) > 0),
  model text not null check (length(trim(model)) > 0),
  input_fingerprint text not null default '',
  context_summary text not null default '',
  suggestion text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_feedback (
  id uuid primary key default gen_random_uuid(),
  tenant_key text not null references public.tenants(tenant_key) on delete cascade,
  interaction_id uuid not null references public.ai_interactions(id) on delete cascade,
  user_id text not null default '',
  rating smallint not null default 0 check (rating between -1 and 1),
  correction_text text not null default '',
  correction_summary text not null default '',
  approved_for_learning boolean not null default false,
  retention_scope text not null default 'session_only' check (retention_scope in ('session_only','tenant_private','candidate_app')),
  sensitivity text not null default 'safe' check (sensitivity in ('safe','tenant_confidential','commercial_sensitive','personal_data','secret')),
  created_at timestamptz not null default now()
);

create table if not exists public.ai_lessons (
  id uuid primary key default gen_random_uuid(),
  tenant_key text references public.tenants(tenant_key) on delete cascade,
  scope text not null default 'tenant_private' check (scope in ('tenant_private','app_knowledge')),
  lesson text not null check (length(trim(lesson)) > 0),
  context_summary text not null default '',
  tags text[] not null default '{}'::text[],
  source_feedback_id uuid references public.ai_feedback(id) on delete set null,
  confidence numeric(4,3) not null default 0.550 check (confidence >= 0 and confidence <= 1),
  confirmations integer not null default 1 check (confirmations >= 0),
  status text not null default 'active' check (status in ('candidate','active','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_lessons_scope_tenant_check check (
    (scope = 'tenant_private' and tenant_key is not null)
    or (scope = 'app_knowledge' and tenant_key is null)
  )
);

alter table public.ai_interactions enable row level security;
alter table public.ai_feedback enable row level security;
alter table public.ai_lessons enable row level security;

create index if not exists ai_interactions_tenant_created_idx on public.ai_interactions(tenant_key, created_at desc);
create index if not exists ai_feedback_tenant_created_idx on public.ai_feedback(tenant_key, created_at desc);
create index if not exists ai_feedback_interaction_idx on public.ai_feedback(interaction_id);
create index if not exists ai_lessons_tenant_status_idx on public.ai_lessons(tenant_key, status, updated_at desc);
create index if not exists ai_lessons_tags_idx on public.ai_lessons using gin(tags);
create index if not exists ai_lessons_search_idx on public.ai_lessons using gin(to_tsvector('portuguese', coalesce(context_summary,'') || ' ' || coalesce(lesson,'')));

create or replace function public.find_ai_lessons(p_tenant_key text, p_query text, p_limit integer default 8)
returns table (
  id uuid,
  scope text,
  lesson text,
  context_summary text,
  tags text[],
  confidence numeric,
  confirmations integer,
  rank real
)
language sql
stable
set search_path = public
as $$
  with q as (
    select websearch_to_tsquery('portuguese', left(coalesce(p_query,''), 1200)) as query
  )
  select l.id, l.scope, l.lesson, l.context_summary, l.tags, l.confidence, l.confirmations,
         ts_rank_cd(to_tsvector('portuguese', coalesce(l.context_summary,'') || ' ' || coalesce(l.lesson,'')), q.query)::real as rank
  from public.ai_lessons l, q
  where l.status = 'active'
    and (l.tenant_key = p_tenant_key or (l.scope = 'app_knowledge' and l.tenant_key is null))
    and length(trim(coalesce(p_query,''))) > 0
    and to_tsvector('portuguese', coalesce(l.context_summary,'') || ' ' || coalesce(l.lesson,'')) @@ q.query
  order by rank desc, l.confidence desc, l.confirmations desc, l.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 8), 20));
$$;

revoke all on table public.ai_interactions, public.ai_feedback, public.ai_lessons from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_interactions, public.ai_feedback, public.ai_lessons to service_role;
revoke all on function public.find_ai_lessons(text,text,integer) from public, anon, authenticated;
grant execute on function public.find_ai_lessons(text,text,integer) to service_role;
