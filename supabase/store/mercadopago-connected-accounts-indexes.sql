-- Aplicado no Supabase central apos o Advisor indicar FKs sem indice.
create index if not exists mp_app_payment_settings_updated_by_idx
  on private.mp_app_payment_settings(updated_by);
create index if not exists mp_oauth_states_user_id_idx
  on private.mp_oauth_states(user_id);
