-- Remove a trava de checklist duplicada do banco.
-- A exigência de checklist é validada no servidor, que conhece o plano do tenant.
-- Isso evita que o plano Start fique preso em Identificação por uma regra global do RPC.

create or replace function public.save_workspace_state(
  p_tenant_key text,
  p_expected_revision bigint,
  p_data jsonb,
  p_updated_by text default null::text
)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_current bigint := 0;
  v_next bigint;
  v_data jsonb;
  v_current_data jsonb;
begin
  if p_tenant_key is null or length(trim(p_tenant_key)) = 0 then
    raise exception 'tenant_key_required';
  end if;

  if jsonb_typeof(p_data) <> 'object' then
    raise exception 'workspace_data_invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('zeus:' || p_tenant_key, 0));

  insert into public.tenants(tenant_key, updated_at)
  values (p_tenant_key, now())
  on conflict (tenant_key) do update set updated_at = now();

  select revision, data
    into v_current, v_current_data
    from public.workspace_state
   where tenant_key = p_tenant_key
   for update;

  if not found then
    v_current := 0;
    v_current_data := '{}'::jsonb;
  end if;

  if v_current <> greatest(0, coalesce(p_expected_revision, 0)) then
    return jsonb_build_object(
      'ok', false,
      'conflict', true,
      'revision', v_current,
      'data', coalesce(v_current_data, '{}'::jsonb)
    );
  end if;

  v_next := v_current + 1;
  v_data := jsonb_set(p_data, '{revision}', to_jsonb(v_next), true);

  perform public.sync_zeus_workspace(p_tenant_key, v_data);

  insert into public.workspace_state(tenant_key, revision, data, updated_by, updated_at)
  values (p_tenant_key, v_next, v_data, nullif(p_updated_by, ''), now())
  on conflict (tenant_key) do update
    set revision = excluded.revision,
        data = excluded.data,
        updated_by = excluded.updated_by,
        updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'conflict', false,
    'revision', v_next,
    'data', v_data
  );
end;
$function$;
