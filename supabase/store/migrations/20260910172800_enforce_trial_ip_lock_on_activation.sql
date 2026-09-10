begin;

alter table private.mp_trial_ip_locks alter column first_subscription_id drop not null;

create or replace function public.mp_reserve_trial_ip(target_account uuid, target_app text, target_user uuid, client_ip text)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  ip text := trim(coalesce(client_ip,''));
  ih text;
  existing_account uuid;
begin
  if ip='' or length(ip)>128 then return false; end if;
  if not exists(select 1 from public.account_members m where m.account_id=target_account and m.user_id=target_user and m.status='active') then return false; end if;
  if not public.mp_trial_eligible(target_account,target_app,target_user) then return false; end if;
  ih := private.antifraud_hmac(ip);
  perform pg_advisory_xact_lock(hashtextextended('mp-trial-ip:'||ih,0));
  select account_id into existing_account from private.mp_trial_ip_locks where ip_hash=ih;
  if found then return existing_account=target_account; end if;
  insert into private.mp_trial_ip_locks(ip_hash,account_id,user_id,first_subscription_id,first_app_id)
  values(ih,target_account,target_user,null,target_app);
  return true;
end;
$$;
revoke all on function public.mp_reserve_trial_ip(uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.mp_reserve_trial_ip(uuid,text,uuid,text) to service_role;

create or replace function public.mp_register_checkout_trial(local_id uuid, provider_payer_id text, provider_card_id text, trial_ends timestamptz)
returns boolean
language plpgsql
set search_path=''
as $$
declare
  s public.mp_subscriptions%rowtype;
  uid uuid;
  p text := nullif(trim(provider_payer_id), '');
  c text := nullif(trim(provider_card_id), '');
begin
  select * into strict s from public.mp_subscriptions where id = local_id;
  if not s.trial_requested then return false; end if;
  if exists (select 1 from private.mp_checkout_trials t where t.subscription_id = s.id) then
    return true;
  end if;

  if p is null then return false; end if;
  if trial_ends is null or trial_ends <= now() + interval '6 days' or trial_ends > now() + interval '8 days' then
    return false;
  end if;

  uid := s.created_by_user_id;
  if uid is null then
    select m.user_id into uid
    from public.account_members m
    where m.account_id = s.account_id and m.role = 'owner' and m.status = 'active'
    order by m.created_at
    limit 1;
  end if;
  if uid is null then return false; end if;

  if not exists(select 1 from private.mp_trial_ip_locks l where l.account_id=s.account_id) then return false; end if;

  perform pg_advisory_xact_lock(hashtextextended('mp-trial-account:' || s.account_id::text || ':' || s.app_id, 0));
  perform pg_advisory_xact_lock(hashtextextended('mp-trial-user:' || uid::text || ':' || s.app_id, 0));
  perform pg_advisory_xact_lock(hashtextextended('mp-trial-payer:' || p || ':' || s.app_id, 0));
  if c is not null then perform pg_advisory_xact_lock(hashtextextended('mp-trial-card:' || c || ':' || s.app_id, 0)); end if;

  if exists (select 1 from public.account_apps aa where aa.account_id = s.account_id and aa.app_id = s.app_id) then
    return false;
  end if;
  if exists (
    select 1 from private.app_trials t
    where t.app_id = s.app_id and (t.account_id = s.account_id or t.user_id = uid)
  ) then return false; end if;
  if exists (
    select 1 from private.mp_checkout_trials t
    where t.app_id = s.app_id and (
      t.account_id = s.account_id
      or t.user_id = uid
      or t.payer_id = p
      or (c is not null and t.card_id = c)
    )
  ) then return false; end if;

  begin
    insert into private.mp_checkout_trials(
      subscription_id, account_id, app_id, user_id, payer_id, card_id,
      phone_hash, document_hash, ends_at
    ) values (
      s.id, s.account_id, s.app_id, uid, p, c,
      null, null, trial_ends
    );
  exception when unique_violation then
    return false;
  end;

  update private.mp_trial_ip_locks
  set first_subscription_id=coalesce(first_subscription_id,s.id)
  where account_id=s.account_id;

  insert into public.account_apps(account_id, app_id, plan_id, status, current_period_end)
  values (s.account_id, s.app_id, s.plan_id, 'trialing', trial_ends)
  on conflict (account_id, app_id) do nothing;
  if not found then
    delete from private.mp_checkout_trials where subscription_id = s.id;
    return false;
  end if;

  update public.mp_subscriptions
  set trial_ends_at = trial_ends, updated_at = now()
  where id = s.id;
  return true;
end;
$$;

commit;
