-- Zeus — checklist operacional no projeto próprio
-- Equivale às migrations aplicadas em produção em 2026-09-15:
-- zeus_checklist_operational_binding, zeus_checklist_atomic_completion e zeus_checklist_status_after_completion.

create table if not exists public.checklist_links (
  id uuid primary key default gen_random_uuid(),
  tenant_key text not null references public.tenants(tenant_key) on delete cascade,
  job_id uuid not null,
  token text not null,
  title text not null default '',
  asset_folder text not null default '',
  segment text not null default '',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','completed','cancelled')),
  created_by text not null default '',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (tenant_key, job_id),
  unique (token),
  foreign key (tenant_key, job_id) references public.jobs(tenant_key, id) on delete cascade
);

create table if not exists public.checklist_responses (
  id uuid primary key default gen_random_uuid(),
  tenant_key text not null references public.tenants(tenant_key) on delete cascade,
  link_id uuid not null references public.checklist_links(id) on delete cascade,
  job_id uuid not null,
  response jsonb not null default '{}'::jsonb,
  meter_value text not null default '',
  completed_by text not null default '',
  created_at timestamptz not null default now(),
  unique (tenant_key, job_id),
  unique (link_id),
  foreign key (tenant_key, job_id) references public.jobs(tenant_key, id) on delete cascade
);

create index if not exists checklist_links_tenant_status_idx on public.checklist_links (tenant_key, status, created_at desc);
create index if not exists checklist_responses_tenant_created_idx on public.checklist_responses (tenant_key, created_at desc);

alter table public.job_attachments add column if not exists stage text not null default '';
alter table public.job_attachments add column if not exists source text not null default 'manual';
alter table public.job_attachments add column if not exists author text not null default '';
alter table public.job_attachments add column if not exists captured_at timestamptz;
alter table public.job_attachments add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.jobs add column if not exists related_job_id uuid;
alter table public.jobs add column if not exists warranty_reason text not null default '';
create index if not exists jobs_tenant_related_job_idx on public.jobs (tenant_key, related_job_id) where related_job_id is not null;

alter table public.checklist_links enable row level security;
alter table public.checklist_responses enable row level security;
revoke all on public.checklist_links from anon, authenticated;
revoke all on public.checklist_responses from anon, authenticated;
grant select, insert, update, delete on public.checklist_links to service_role;
grant select, insert, update, delete on public.checklist_responses to service_role;

create or replace function public.submit_zeus_checklist(p_token text, p_response jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_link public.checklist_links%rowtype;
  v_workspace public.workspace_state%rowtype;
  v_data jsonb;
  v_revision bigint;
  v_meter text := coalesce(p_response->>'meter','');
  v_completed_at timestamptz := now();
  v_asset_id uuid;
  v_job jsonb;
  v_assets jsonb;
  v_jobs jsonb;
  v_custom jsonb;
  v_job_values jsonb;
  v_next_status text;
begin
  if p_token is null or length(p_token) < 32 or jsonb_typeof(p_response) <> 'object' then raise exception 'checklist_invalid'; end if;
  select * into v_link from public.checklist_links where token=p_token for update;
  if not found then raise exception 'checklist_not_found'; end if;
  if v_link.status='completed' or exists(select 1 from public.checklist_responses where link_id=v_link.id) then
    return jsonb_build_object('ok',false,'completed',true,'jobId',v_link.job_id);
  end if;
  select * into v_workspace from public.workspace_state where tenant_key=v_link.tenant_key for update;
  if not found then raise exception 'workspace_not_found'; end if;
  v_data:=v_workspace.data; v_revision:=v_workspace.revision+1;
  select value into v_job from jsonb_array_elements(coalesce(v_data->'jobs','[]'::jsonb)) where value->>'id'=v_link.job_id::text limit 1;
  if v_job is null then raise exception 'job_not_found'; end if;
  v_asset_id:=nullif(v_job->>'assetId','')::uuid;
  v_next_status:=case when coalesce((v_data->'settings'->>'diagnosisEnabled')::boolean,true) then 'Aguardando diagnóstico' when coalesce((v_data->'settings'->>'budgetEnabled')::boolean,true) then 'Aguardando orçamento' else 'Aguardando execução' end;

  insert into public.checklist_responses(tenant_key,link_id,job_id,response,meter_value,completed_by,created_at)
  values(v_link.tenant_key,v_link.id,v_link.job_id,p_response,v_meter,coalesce(p_response->>'name',''),v_completed_at);
  update public.checklist_links set status='completed',completed_at=v_completed_at,updated_at=v_completed_at where id=v_link.id;

  v_custom:=coalesce(v_data->'customFieldValues','{}'::jsonb);
  v_job_values:=coalesce(v_custom->(v_link.job_id::text),'{}'::jsonb)||jsonb_build_object(
    '__zeus_checklist_completed__','true','__zeus_checklist_completed_at__',v_completed_at::text,
    '__zeus_checklist_response__',p_response::text,'__zeus_checklist_meter__',v_meter);
  v_custom:=jsonb_set(v_custom,array[v_link.job_id::text],v_job_values,true);
  v_data:=jsonb_set(v_data,'{customFieldValues}',v_custom,true);

  if v_asset_id is not null and length(trim(v_meter))>0 then
    select coalesce(jsonb_agg(case when value->>'id'=v_asset_id::text then jsonb_set(value,'{meter}',to_jsonb(v_meter),true) else value end),'[]'::jsonb)
    into v_assets from jsonb_array_elements(coalesce(v_data->'assets','[]'::jsonb));
    v_data:=jsonb_set(v_data,'{assets}',v_assets,true);
  end if;

  select coalesce(jsonb_agg(case when value->>'id'=v_link.job_id::text then
    jsonb_set(jsonb_set(value,'{status}',to_jsonb(v_next_status),true),'{events}',coalesce(value->'events','[]'::jsonb)||jsonb_build_array(jsonb_build_object(
      'id',gen_random_uuid()::text,'at',v_completed_at::text,'text','Checklist de entrada concluído e vinculado à OS')),true)
    else value end),'[]'::jsonb)
  into v_jobs from jsonb_array_elements(coalesce(v_data->'jobs','[]'::jsonb));
  v_data:=jsonb_set(v_data,'{jobs}',v_jobs,true);
  v_data:=jsonb_set(v_data,'{revision}',to_jsonb(v_revision),true);

  perform public.sync_zeus_workspace(v_link.tenant_key,v_data);
  update public.workspace_state set revision=v_revision,data=v_data,updated_by='checklist-public',updated_at=v_completed_at where tenant_key=v_link.tenant_key;
  return jsonb_build_object('ok',true,'completed',true,'jobId',v_link.job_id,'revision',v_revision);
end;
$$;

revoke execute on function public.submit_zeus_checklist(text,jsonb) from public,anon,authenticated;
grant execute on function public.submit_zeus_checklist(text,jsonb) to service_role;

create or replace function public.sync_zeus_extended_workspace()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  j jsonb;
  a jsonb;
  v_service_types text[];
  v_values jsonb;
  v_attachment_meta jsonb;
  v_meta jsonb;
begin
  if new.data is null or jsonb_typeof(new.data) <> 'object' then return new; end if;

  v_values := coalesce(new.data->'customFieldValues','{}'::jsonb);
  if v_values ? '__zeus_service_types__' then
    begin
      select coalesce(array_agg(value),array[]::text[])
        into v_service_types
        from jsonb_array_elements_text((v_values->'__zeus_service_types__'->>'value')::jsonb) as value;
      if coalesce(array_length(v_service_types,1),0) > 0 then
        update public.tenant_settings set service_types=v_service_types,updated_at=now() where tenant_key=new.tenant_key;
      end if;
    exception when others then null;
    end;
  end if;

  for j in select value from jsonb_array_elements(coalesce(new.data->'jobs','[]'::jsonb)) loop
    v_values := coalesce(new.data->'customFieldValues'->(j->>'id'),'{}'::jsonb);
    update public.jobs
       set related_job_id=case when nullif(v_values->>'__zeus_related_job_id__','') is null then null else (v_values->>'__zeus_related_job_id__')::uuid end,
           warranty_reason=coalesce(v_values->>'__zeus_warranty_reason__',''),
           updated_at=now()
     where tenant_key=new.tenant_key and id=(j->>'id')::uuid;

    begin
      v_attachment_meta := coalesce((v_values->>'__zeus_attachment_meta__')::jsonb,'{}'::jsonb);
    exception when others then v_attachment_meta := '{}'::jsonb;
    end;
    for a in select value from jsonb_array_elements(coalesce(j->'attachments','[]'::jsonb)) loop
      v_meta := coalesce(v_attachment_meta->(a->>'id'),'{}'::jsonb);
      update public.job_attachments
         set stage=coalesce(v_meta->>'stage',''),
             source=coalesce(nullif(v_meta->>'source',''),'manual'),
             author=coalesce(v_meta->>'author',''),
             captured_at=case when nullif(v_meta->>'createdAt','') is null then captured_at else (v_meta->>'createdAt')::timestamptz end,
             metadata=coalesce(v_meta->'metadata','{}'::jsonb)
       where tenant_key=new.tenant_key and id=(a->>'id')::uuid;
    end loop;
  end loop;
  return new;
end;
$$;

drop trigger if exists workspace_state_sync_zeus_extended on public.workspace_state;
create trigger workspace_state_sync_zeus_extended
after insert or update of data on public.workspace_state
for each row execute function public.sync_zeus_extended_workspace();
