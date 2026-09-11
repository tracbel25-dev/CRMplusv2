begin;

-- Global rule: one IP can reserve/use only one free trial across the whole Store.
-- Repeating the exact same account + user + app is allowed only as an idempotent retry
-- of the same trial attempt; a different account, user or app is denied.

create or replace function public.mp_trial_eligible_ip(
  target_account uuid,
  target_app text,
  target_user uuid,
  client_ip text
) returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  ip text := trim(coalesce(client_ip,''));
  ih text;
  existing private.mp_trial_ip_locks%rowtype;
begin
  if ip = '' or length(ip) > 128 then return false; end if;
  if not public.mp_trial_eligible(target_account,target_app,target_user) then return false; end if;

  ih := private.antifraud_hmac(ip);
  select * into existing
  from private.mp_trial_ip_locks l
  where l.ip_hash = ih;

  if not found then return true; end if;

  return existing.account_id = target_account
     and existing.user_id = target_user
     and existing.first_app_id = target_app;
end;
$$;
revoke all on function public.mp_trial_eligible_ip(uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.mp_trial_eligible_ip(uuid,text,uuid,text) to service_role;

create or replace function public.mp_reserve_trial_ip(
  target_account uuid,
  target_app text,
  target_user uuid,
  client_ip text
) returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  ip text := trim(coalesce(client_ip,''));
  ih text;
  existing private.mp_trial_ip_locks%rowtype;
begin
  if ip = '' or length(ip) > 128 then return false; end if;
  if not exists(
    select 1 from public.account_members m
    where m.account_id = target_account
      and m.user_id = target_user
      and m.status = 'active'
  ) then return false; end if;
  if not public.mp_trial_eligible(target_account,target_app,target_user) then return false; end if;

  ih := private.antifraud_hmac(ip);
  perform pg_advisory_xact_lock(hashtextextended('mp-trial-ip:' || ih, 0));

  select * into existing
  from private.mp_trial_ip_locks l
  where l.ip_hash = ih;

  if found then
    return existing.account_id = target_account
       and existing.user_id = target_user
       and existing.first_app_id = target_app;
  end if;

  begin
    insert into private.mp_trial_ip_locks(
      ip_hash, account_id, user_id, first_subscription_id, first_app_id
    ) values (
      ih, target_account, target_user, null, target_app
    );
  exception when unique_violation then
    return false;
  end;

  return true;
end;
$$;
revoke all on function public.mp_reserve_trial_ip(uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.mp_reserve_trial_ip(uuid,text,uuid,text) to service_role;

-- Legacy Mercado Pago helper follows the same global IP rule.
create or replace function public.mp_lock_trial_ip(local_id uuid, client_ip text)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  s public.mp_subscriptions%rowtype;
  ip text := trim(coalesce(client_ip,''));
  ih text;
  existing private.mp_trial_ip_locks%rowtype;
begin
  if ip = '' or length(ip) > 128 then return false; end if;

  select * into strict s
  from public.mp_subscriptions
  where id = local_id;

  if not s.trial_requested or s.created_by_user_id is null then return false; end if;

  ih := private.antifraud_hmac(ip);
  perform pg_advisory_xact_lock(hashtextextended('mp-trial-ip:' || ih, 0));

  select * into existing
  from private.mp_trial_ip_locks l
  where l.ip_hash = ih;

  if found then
    if existing.account_id <> s.account_id
       or existing.user_id <> s.created_by_user_id
       or existing.first_app_id <> s.app_id
    then
      return false;
    end if;

    update private.mp_trial_ip_locks
    set first_subscription_id = coalesce(first_subscription_id, s.id)
    where ip_hash = ih;
    return true;
  end if;

  begin
    insert into private.mp_trial_ip_locks(
      ip_hash, account_id, user_id, first_subscription_id, first_app_id
    ) values (
      ih, s.account_id, s.created_by_user_id, s.id, s.app_id
    );
  exception when unique_violation then
    return false;
  end;

  return true;
end;
$$;
revoke all on function public.mp_lock_trial_ip(uuid,text) from public, anon, authenticated;
grant execute on function public.mp_lock_trial_ip(uuid,text) to service_role;

-- Defense in depth: even if a caller bypasses the Edge Function and calls the
-- trial RPC directly, a trial row can only be created for the app bound to the
-- previously reserved IP lock.
create or replace function private.enforce_trial_ip_binding()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if not exists(
    select 1
    from private.mp_trial_ip_locks l
    where l.account_id = new.account_id
      and l.user_id = new.user_id
      and l.first_app_id = new.app_id
  ) then
    raise exception 'trial_network_required';
  end if;

  return new;
end;
$$;
revoke all on function private.enforce_trial_ip_binding() from public, anon, authenticated;

drop trigger if exists enforce_trial_ip_binding_direct on private.app_trials;
create trigger enforce_trial_ip_binding_direct
before insert on private.app_trials
for each row execute function private.enforce_trial_ip_binding();

drop trigger if exists enforce_trial_ip_binding_checkout on private.mp_checkout_trials;
create trigger enforce_trial_ip_binding_checkout
before insert on private.mp_checkout_trials
for each row execute function private.enforce_trial_ip_binding();

commit;
