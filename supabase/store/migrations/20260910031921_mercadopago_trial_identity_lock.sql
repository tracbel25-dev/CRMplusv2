begin;

alter table private.mp_checkout_trials
  add column if not exists phone_hash text,
  add column if not exists document_hash text;

create unique index if not exists mp_checkout_trial_phone_app
  on private.mp_checkout_trials(phone_hash, app_id)
  where phone_hash is not null;
create unique index if not exists mp_checkout_trial_document_app
  on private.mp_checkout_trials(document_hash, app_id)
  where document_hash is not null;

create table if not exists private.mp_trial_candidates (
  subscription_id uuid primary key references public.mp_subscriptions(id) on delete cascade,
  phone_hash text not null,
  document_hash text not null,
  created_at timestamptz not null default now()
);
alter table private.mp_trial_candidates enable row level security;
revoke all on private.mp_trial_candidates from public, anon, authenticated;
grant select, insert, update, delete on private.mp_trial_candidates to service_role;
grant execute on function private.valid_trial_document(text) to service_role;

create or replace function public.mp_prepare_trial_identity(
  target_account uuid,
  target_app text,
  target_user uuid,
  verified_phone text,
  document text,
  local_id uuid default null
) returns text
language plpgsql security invoker set search_path = '' as $$
declare
  phone_digits text := regexp_replace(coalesce(verified_phone,''), '[^0-9]', '', 'g');
  document_digits text := regexp_replace(coalesce(document,''), '[^0-9]', '', 'g');
  secret_key bytea;
  ph text;
  dh text;
begin
  if target_account is null or target_app is null or target_user is null then return 'not_eligible'; end if;
  if phone_digits !~ '^55[1-9][0-9]{9,10}$' then return 'phone_required'; end if;
  if document_digits = '' or not private.valid_trial_document(document_digits) then return 'document_invalid'; end if;

  select secret into strict secret_key from private.trial_key where singleton;
  ph := encode(extensions.hmac(phone_digits, encode(secret_key,'hex'), 'sha256'), 'hex');
  dh := encode(extensions.hmac(document_digits, encode(secret_key,'hex'), 'sha256'), 'hex');

  perform pg_advisory_xact_lock(hashtextextended('trial-identity-phone:' || ph || ':' || target_app, 0));
  perform pg_advisory_xact_lock(hashtextextended('trial-identity-document:' || dh || ':' || target_app, 0));

  if exists (
    select 1 from public.account_apps aa
    where aa.account_id = target_account and aa.app_id = target_app
  ) then return 'not_eligible'; end if;

  if exists (
    select 1 from private.app_trials t
    where t.app_id = target_app and (
      t.account_id = target_account or t.user_id = target_user
      or t.phone_hash = ph or t.document_hash = dh
    )
  ) then return 'identity_used'; end if;

  if exists (
    select 1 from private.mp_checkout_trials t
    where t.app_id = target_app and (
      t.account_id = target_account or t.user_id = target_user
      or t.phone_hash = ph or t.document_hash = dh
    )
  ) then return 'identity_used'; end if;

  if local_id is not null then
    if not exists (
      select 1 from public.mp_subscriptions s
      where s.id = local_id
        and s.account_id = target_account
        and s.app_id = target_app
        and s.created_by_user_id = target_user
        and s.trial_requested = true
    ) then return 'not_eligible'; end if;

    insert into private.mp_trial_candidates(subscription_id, phone_hash, document_hash)
    values (local_id, ph, dh)
    on conflict (subscription_id) do update
      set phone_hash = excluded.phone_hash,
          document_hash = excluded.document_hash,
          created_at = now();
  end if;

  return 'eligible';
end;
$$;
revoke all on function public.mp_prepare_trial_identity(uuid,text,uuid,text,text,uuid) from public, anon, authenticated;
grant execute on function public.mp_prepare_trial_identity(uuid,text,uuid,text,text,uuid) to service_role;

create or replace function public.mp_register_checkout_trial(
  local_id uuid,
  provider_payer_id text,
  provider_card_id text,
  trial_ends timestamptz
) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare
  s public.mp_subscriptions%rowtype;
  uid uuid;
  p text := nullif(trim(provider_payer_id), '');
  c text := nullif(trim(provider_card_id), '');
  candidate private.mp_trial_candidates%rowtype;
begin
  select * into strict s from public.mp_subscriptions where id = local_id;
  if not s.trial_requested then return false; end if;
  if trial_ends is null or trial_ends <= now() + interval '6 days' or trial_ends > now() + interval '8 days' then
    return false;
  end if;

  if exists (select 1 from private.mp_checkout_trials t where t.subscription_id = s.id) then
    return true;
  end if;

  select * into candidate from private.mp_trial_candidates where subscription_id = s.id;
  if not found then return false; end if;

  uid := s.created_by_user_id;
  if uid is null then
    select m.user_id into uid
    from public.account_members m
    where m.account_id = s.account_id and m.role = 'owner' and m.status = 'active'
    order by m.created_at
    limit 1;
  end if;
  if uid is null then return false; end if;

  perform pg_advisory_xact_lock(hashtextextended('mp-trial-account:' || s.account_id::text || ':' || s.app_id, 0));
  perform pg_advisory_xact_lock(hashtextextended('mp-trial-user:' || uid::text || ':' || s.app_id, 0));
  perform pg_advisory_xact_lock(hashtextextended('mp-trial-phone:' || candidate.phone_hash || ':' || s.app_id, 0));
  perform pg_advisory_xact_lock(hashtextextended('mp-trial-document:' || candidate.document_hash || ':' || s.app_id, 0));
  if p is not null then perform pg_advisory_xact_lock(hashtextextended('mp-trial-payer:' || p || ':' || s.app_id, 0)); end if;
  if c is not null then perform pg_advisory_xact_lock(hashtextextended('mp-trial-card:' || c || ':' || s.app_id, 0)); end if;

  if exists (select 1 from public.account_apps aa where aa.account_id = s.account_id and aa.app_id = s.app_id) then
    return false;
  end if;

  if exists (
    select 1 from private.app_trials t
    where t.app_id = s.app_id and (
      t.account_id = s.account_id or t.user_id = uid
      or t.phone_hash = candidate.phone_hash
      or t.document_hash = candidate.document_hash
    )
  ) then return false; end if;

  if exists (
    select 1 from private.mp_checkout_trials t
    where t.app_id = s.app_id and (
      t.account_id = s.account_id or t.user_id = uid
      or t.phone_hash = candidate.phone_hash
      or t.document_hash = candidate.document_hash
      or (p is not null and t.payer_id = p)
      or (c is not null and t.card_id = c)
    )
  ) then return false; end if;

  begin
    insert into private.mp_checkout_trials(
      subscription_id, account_id, app_id, user_id, payer_id, card_id,
      phone_hash, document_hash, ends_at
    ) values (
      s.id, s.account_id, s.app_id, uid, p, c,
      candidate.phone_hash, candidate.document_hash, trial_ends
    );
  exception when unique_violation then
    return false;
  end;

  insert into public.account_apps(account_id,app_id,plan_id,status,current_period_end)
  values (s.account_id,s.app_id,s.plan_id,'trialing',trial_ends)
  on conflict (account_id,app_id) do nothing;
  if not found then
    delete from private.mp_checkout_trials where subscription_id = s.id;
    return false;
  end if;

  update public.mp_subscriptions set trial_ends_at = trial_ends, updated_at = now() where id = s.id;
  return true;
end;
$$;
revoke all on function public.mp_register_checkout_trial(uuid,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.mp_register_checkout_trial(uuid,text,text,timestamptz) to service_role;

commit;
