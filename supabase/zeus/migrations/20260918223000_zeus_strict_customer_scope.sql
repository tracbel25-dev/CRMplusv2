-- Zeus — isolamento estrito por cliente dentro de cada tenant.
-- Mantém o mesmo projeto Supabase. O tenant continua sendo account_id da Store.
-- A aplicação também sanitiza leituras antigas; este trigger impede novas gravações cruzadas.

create or replace function public.assert_zeus_workspace_customer_scope(p_data jsonb)
returns void
language plpgsql
set search_path = pg_catalog, public
as $
declare
  v_job jsonb;
  v_appointment jsonb;
  v_asset jsonb;
  v_customer_id text;
  v_asset_id text;
  v_job_id text;
  v_quote_customer_id text;
begin
  if p_data is null then
    raise exception 'workspace data is required';
  end if;

  for v_asset in
    select value from jsonb_array_elements(coalesce(p_data->'assets', '[]'::jsonb))
  loop
    v_customer_id := nullif(trim(v_asset->>'customerId'), '');
    if v_customer_id is null or not exists (
      select 1
      from jsonb_array_elements(coalesce(p_data->'customers', '[]'::jsonb)) customer
      where customer->>'id' = v_customer_id
    ) then
      raise exception 'CUSTOMER_RELATION_INVALID: asset % has no valid customer', coalesce(v_asset->>'id', '?');
    end if;
  end loop;

  for v_job in
    select value from jsonb_array_elements(coalesce(p_data->'jobs', '[]'::jsonb))
  loop
    v_customer_id := nullif(trim(v_job->>'customerId'), '');
    v_asset_id := nullif(trim(v_job->>'assetId'), '');
    v_quote_customer_id := nullif(trim(v_job->'quote'->>'customerId'), '');

    if v_customer_id is null or v_asset_id is null then
      raise exception 'CUSTOMER_RELATION_INVALID: job % is missing customer or asset', coalesce(v_job->>'id', '?');
    end if;

    if not exists (
      select 1
      from jsonb_array_elements(coalesce(p_data->'customers', '[]'::jsonb)) customer
      where customer->>'id' = v_customer_id
    ) then
      raise exception 'CUSTOMER_RELATION_INVALID: job % customer does not exist', coalesce(v_job->>'id', '?');
    end if;

    if not exists (
      select 1
      from jsonb_array_elements(coalesce(p_data->'assets', '[]'::jsonb)) asset
      where asset->>'id' = v_asset_id
        and asset->>'customerId' = v_customer_id
    ) then
      raise exception 'CUSTOMER_RELATION_INVALID: job % asset belongs to another customer', coalesce(v_job->>'id', '?');
    end if;

    if v_quote_customer_id is not null and v_quote_customer_id <> v_customer_id then
      raise exception 'CUSTOMER_RELATION_INVALID: job % quote belongs to another customer', coalesce(v_job->>'id', '?');
    end if;
  end loop;

  for v_appointment in
    select value from jsonb_array_elements(coalesce(p_data->'appointments', '[]'::jsonb))
  loop
    v_customer_id := nullif(trim(v_appointment->>'customerId'), '');
    v_asset_id := nullif(trim(v_appointment->>'assetId'), '');
    v_job_id := nullif(trim(v_appointment->>'jobId'), '');

    if v_customer_id is null or v_asset_id is null or not exists (
      select 1
      from jsonb_array_elements(coalesce(p_data->'assets', '[]'::jsonb)) asset
      where asset->>'id' = v_asset_id
        and asset->>'customerId' = v_customer_id
    ) then
      raise exception 'CUSTOMER_RELATION_INVALID: appointment % crosses customer and asset', coalesce(v_appointment->>'id', '?');
    end if;

    if v_job_id is not null and not exists (
      select 1
      from jsonb_array_elements(coalesce(p_data->'jobs', '[]'::jsonb)) job
      where job->>'id' = v_job_id
        and job->>'customerId' = v_customer_id
        and job->>'assetId' = v_asset_id
    ) then
      raise exception 'CUSTOMER_RELATION_INVALID: appointment % points to a job from another customer', coalesce(v_appointment->>'id', '?');
    end if;
  end loop;
end;
$$;

create or replace function public.enforce_zeus_workspace_customer_scope()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $
begin
  perform public.assert_zeus_workspace_customer_scope(new.data);
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.workspace_state') is not null then
    execute 'drop trigger if exists trg_zeus_workspace_customer_scope on public.workspace_state';
    execute 'create trigger trg_zeus_workspace_customer_scope before insert or update of data on public.workspace_state for each row execute function public.enforce_zeus_workspace_customer_scope()';
  end if;
end;
$$;

revoke all on function public.assert_zeus_workspace_customer_scope(jsonb) from public, anon, authenticated;
revoke all on function public.enforce_zeus_workspace_customer_scope() from public, anon, authenticated;
grant execute on function public.assert_zeus_workspace_customer_scope(jsonb) to service_role;
grant execute on function public.enforce_zeus_workspace_customer_scope() to service_role;
