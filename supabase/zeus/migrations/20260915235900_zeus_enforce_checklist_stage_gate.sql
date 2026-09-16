-- Impede que uma OS saia da Identificação enquanto o checklist selecionado não tiver resposta real no Zeus.
-- A validação usa checklist_responses como fonte autoritativa, não apenas flags enviadas pelo cliente.

create or replace function public.save_workspace_state(
  p_tenant_key text,
  p_expected_revision bigint,
  p_data jsonb,
  p_updated_by text default null::text
)
returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare
  v_current bigint := 0;
  v_next bigint;
  v_data jsonb;
  v_current_data jsonb;
  v_job jsonb;
  v_old_job jsonb;
  v_values jsonb;
  v_config jsonb := '{}'::jsonb;
  v_job_id uuid;
  v_enabled text;
  v_folder text;
  v_default_folder text;
  v_config_enabled boolean := true;
  v_requires_checklist boolean;
begin
  if p_tenant_key is null or length(trim(p_tenant_key)) = 0 then raise exception 'tenant_key_required'; end if;
  if jsonb_typeof(p_data) <> 'object' then raise exception 'workspace_data_invalid'; end if;

  perform pg_advisory_xact_lock(hashtextextended('zeus:' || p_tenant_key, 0));
  insert into public.tenants(tenant_key, updated_at)
  values (p_tenant_key, now())
  on conflict (tenant_key) do update set updated_at=now();

  select revision, data into v_current, v_current_data
    from public.workspace_state
   where tenant_key=p_tenant_key
   for update;
  if not found then
    v_current := 0;
    v_current_data := '{}'::jsonb;
  end if;

  if v_current <> greatest(0,coalesce(p_expected_revision,0)) then
    return jsonb_build_object('ok',false,'conflict',true,'revision',v_current,'data',coalesce(v_current_data,'{}'::jsonb));
  end if;

  begin
    v_config := coalesce((p_data->'customFieldValues'->'__zeus_checkin_config__'->>'value')::jsonb,'{}'::jsonb);
  exception when others then
    v_config := '{}'::jsonb;
  end;
  begin
    v_config_enabled := coalesce((v_config->>'enabled')::boolean,true);
  exception when others then
    v_config_enabled := true;
  end;
  v_default_folder := coalesce(v_config->>'defaultAssetFolder','carro');

  for v_job in select value from jsonb_array_elements(coalesce(p_data->'jobs','[]'::jsonb)) loop
    if nullif(v_job->>'id','') is null then continue; end if;
    begin
      v_job_id := (v_job->>'id')::uuid;
    exception when others then
      continue;
    end;

    select value into v_old_job
      from jsonb_array_elements(coalesce(v_current_data->'jobs','[]'::jsonb))
     where value->>'id'=v_job_id::text
     limit 1;

    if v_old_job is not null
       and coalesce(v_old_job->>'stage','Identificação')='Identificação'
       and coalesce(v_job->>'stage','Identificação')<>'Identificação' then
      v_values := coalesce(p_data->'customFieldValues'->(v_job_id::text),'{}'::jsonb);
      v_enabled := coalesce(v_values->>'__zeus_checklist_enabled__','');
      v_folder := coalesce(v_values->>'__zeus_checklist_asset_folder__','');

      v_requires_checklist := case
        when v_enabled='false' then false
        when length(trim(v_folder))>0 then true
        when v_enabled='true' then true
        when v_config_enabled and length(trim(v_default_folder))>0 then true
        else false
      end;

      if v_requires_checklist and not exists (
        select 1
          from public.checklist_responses r
         where r.tenant_key=p_tenant_key
           and r.job_id=v_job_id
      ) then
        raise exception 'checklist_required_before_stage_advance';
      end if;
    end if;
  end loop;

  v_next := v_current + 1;
  v_data := jsonb_set(p_data, '{revision}', to_jsonb(v_next), true);
  perform public.sync_zeus_workspace(p_tenant_key, v_data);

  insert into public.workspace_state(tenant_key, revision, data, updated_by, updated_at)
  values (p_tenant_key, v_next, v_data, nullif(p_updated_by,''), now())
  on conflict (tenant_key) do update
    set revision=excluded.revision,
        data=excluded.data,
        updated_by=excluded.updated_by,
        updated_at=now();

  return jsonb_build_object('ok',true,'conflict',false,'revision',v_next,'data',v_data);
end;
$$;
