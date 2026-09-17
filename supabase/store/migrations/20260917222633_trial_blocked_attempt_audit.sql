create table if not exists private.trial_blocked_attempts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  app_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid null references public.plans(id) on delete set null,
  person_type text null,
  reason text not null check (reason in ('ip','cpf','cnpj','cpf_cnpj','user','previous_trial','previous_access','identity_missing','network_unavailable','other')),
  ip_hash text null,
  owner_document_hash text null,
  company_hash text null,
  created_at timestamptz not null default now()
);

create index if not exists trial_blocked_attempts_created_at_idx on private.trial_blocked_attempts(created_at desc);
create index if not exists trial_blocked_attempts_account_idx on private.trial_blocked_attempts(account_id, app_id, created_at desc);
create index if not exists trial_blocked_attempts_reason_idx on private.trial_blocked_attempts(reason, created_at desc);

revoke all on private.trial_blocked_attempts from public, anon, authenticated;

create or replace function private.trial_block_reason(
  target_account uuid,
  target_app text,
  target_user uuid,
  client_ip text
) returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_person_type text;
  v_cnpj text;
  v_owner_hash text;
  v_company_hash text;
  v_ip_hash text;
  v_has_cpf boolean := false;
  v_has_cnpj boolean := false;
  v_ip text := trim(coalesce(client_ip,''));
begin
  select a.person_type, a.cnpj into v_person_type, v_cnpj
  from public.accounts a
  where a.id=target_account and a.status='active';
  if not found then return 'other'; end if;

  select i.document_hash into v_owner_hash
  from private.signup_identities i
  where i.account_id=target_account and i.user_id=target_user
  limit 1;
  if v_owner_hash is null then return 'identity_missing'; end if;

  if exists(select 1 from public.account_apps aa where aa.account_id=target_account and aa.app_id=target_app) then
    return 'previous_access';
  end if;

  if exists(select 1 from private.app_trials t where t.app_id=target_app and (t.account_id=target_account or t.user_id=target_user))
     or exists(select 1 from private.mp_checkout_trials t where t.app_id=target_app and (t.account_id=target_account or t.user_id=target_user)) then
    return 'previous_trial';
  end if;

  v_has_cpf := exists(
    select 1 from private.trial_identity_claims c
    where c.app_id=target_app and c.owner_document_hash=v_owner_hash
  );

  if v_person_type='pj' and v_cnpj is not null and public.valid_cnpj(v_cnpj) then
    v_company_hash := private.antifraud_hmac(v_cnpj);
    v_has_cnpj := exists(
      select 1 from private.trial_identity_claims c
      where c.app_id=target_app and c.company_hash=v_company_hash
    );
  else
    v_company_hash := private.antifraud_hmac('owner:' || v_owner_hash);
  end if;

  if v_has_cpf and v_has_cnpj then return 'cpf_cnpj'; end if;
  if v_has_cnpj then return 'cnpj'; end if;
  if v_has_cpf then return 'cpf'; end if;

  if exists(select 1 from private.trial_identity_claims c where c.app_id=target_app and c.user_id=target_user) then
    return 'user';
  end if;

  if v_ip='' or length(v_ip)>128 then return 'network_unavailable'; end if;
  v_ip_hash := private.antifraud_hmac(v_ip);
  if exists(
    select 1 from private.mp_trial_ip_locks l
    where l.ip_hash=v_ip_hash
      and (l.account_id<>target_account or l.user_id<>target_user or l.first_app_id<>target_app)
  ) then return 'ip'; end if;

  return 'eligible';
end;
$$;

create or replace function public.trial_block_reason(
  target_account uuid,
  target_app text,
  target_user uuid,
  client_ip text
) returns text
language sql
stable
security definer
set search_path = ''
as $$
  select private.trial_block_reason(target_account,target_app,target_user,client_ip);
$$;

revoke all on function public.trial_block_reason(uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.trial_block_reason(uuid,text,uuid,text) to service_role;

create or replace function public.record_trial_blocked_attempt(
  target_account uuid,
  target_app text,
  target_user uuid,
  target_plan uuid,
  client_ip text,
  block_reason text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person_type text;
  v_cnpj text;
  v_owner_hash text;
  v_company_hash text;
  v_ip_hash text;
  v_reason text := case when block_reason in ('ip','cpf','cnpj','cpf_cnpj','user','previous_trial','previous_access','identity_missing','network_unavailable','other') then block_reason else 'other' end;
begin
  select a.person_type, a.cnpj into v_person_type, v_cnpj
  from public.accounts a where a.id=target_account;

  select i.document_hash into v_owner_hash
  from private.signup_identities i
  where i.account_id=target_account and i.user_id=target_user
  limit 1;

  if v_person_type='pj' and v_cnpj is not null and public.valid_cnpj(v_cnpj) then
    v_company_hash := private.antifraud_hmac(v_cnpj);
  elsif v_owner_hash is not null then
    v_company_hash := private.antifraud_hmac('owner:' || v_owner_hash);
  end if;

  if nullif(trim(coalesce(client_ip,'')),'') is not null and length(trim(client_ip))<=128 then
    v_ip_hash := private.antifraud_hmac(trim(client_ip));
  end if;

  insert into private.trial_blocked_attempts(
    account_id,app_id,user_id,plan_id,person_type,reason,ip_hash,owner_document_hash,company_hash
  ) values(
    target_account,target_app,target_user,target_plan,v_person_type,v_reason,v_ip_hash,v_owner_hash,v_company_hash
  );
end;
$$;

revoke all on function public.record_trial_blocked_attempt(uuid,text,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.record_trial_blocked_attempt(uuid,text,uuid,uuid,text,text) to service_role;

update public.mp_subscriptions
set status='failed', updated_at=now()
where status='pending'
  and trial_requested=true
  and dedicated_trial_plan=true
  and preapproval_id is null
  and trial_ends_at is null;
