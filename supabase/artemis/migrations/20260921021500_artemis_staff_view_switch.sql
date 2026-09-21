alter table public.tenant_settings
  add column if not exists allow_staff_view_switch boolean not null default false;

comment on column public.tenant_settings.allow_staff_view_switch is
  'Quando verdadeiro, integrantes com acesso operacional ao Artemis podem alternar temporariamente entre Atendimento e Cozinha sem mudar a permissão permanente.';
