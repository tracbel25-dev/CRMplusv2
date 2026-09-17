create or replace function public.ensure_zeus_tenant_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tenant_entitlements (tenant_key, plan_code, source)
  values (new.tenant_key, 'start', 'tenant_bootstrap')
  on conflict (tenant_key) do nothing;
  return new;
end;
$$;

drop trigger if exists tenants_entitlement_bootstrap on public.tenants;
create trigger tenants_entitlement_bootstrap
after insert on public.tenants
for each row execute function public.ensure_zeus_tenant_entitlement();

revoke all on function public.ensure_zeus_tenant_entitlement() from public, anon, authenticated;
grant execute on function public.ensure_zeus_tenant_entitlement() to service_role;
