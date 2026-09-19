alter function public.assert_zeus_workspace_customer_scope(jsonb)
  set search_path = pg_catalog, public;

alter function public.enforce_zeus_workspace_customer_scope()
  set search_path = pg_catalog, public;
