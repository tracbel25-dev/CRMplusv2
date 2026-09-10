-- Service-only access for the existing invoker billing functions.
begin;
grant usage on schema private to service_role;
grant select on private.app_trials, private.trial_key to service_role;
grant delete on private.mp_checkout_trials to service_role;

-- Repeated provider notifications never restart or cancel an existing trial.
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
  if exists (select 1 from private.mp_checkout_trials t where t.subscription_id = s.id) then
    return true;
  end if;

  if trial_ends is null or trial_ends <= now() + interval '6 days' or trial_ends > now() + interval '8 days' then
    return false;
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

commit;
