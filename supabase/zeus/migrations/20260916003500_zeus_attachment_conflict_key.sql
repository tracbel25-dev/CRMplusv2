-- sync_zeus_workspace usa ON CONFLICT (tenant_key,id) ao projetar anexos R2.
-- O id já é globalmente único, mas a chave composta precisa existir para o conflict target ser válido.

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conrelid='public.job_attachments'::regclass
       and conname='job_attachments_tenant_key_id_key'
  ) then
    alter table public.job_attachments
      add constraint job_attachments_tenant_key_id_key unique (tenant_key,id);
  end if;
end
$$;
