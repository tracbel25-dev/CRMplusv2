alter table public.tenant_settings
  add column if not exists delivery_acceptance_view text not null default 'atendimento';

alter table public.tenant_settings
  drop constraint if exists tenant_settings_delivery_acceptance_view_check;

alter table public.tenant_settings
  add constraint tenant_settings_delivery_acceptance_view_check
  check (delivery_acceptance_view in ('atendimento','cozinha','gestao'));

comment on column public.tenant_settings.delivery_acceptance_view is
  'Visão responsável por aceitar ou recusar pedidos Delivery: atendimento, cozinha ou gestao.';
