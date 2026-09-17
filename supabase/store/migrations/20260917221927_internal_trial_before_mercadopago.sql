create or replace function public.activate_verified_app_trial(target_account uuid,target_app text,target_user uuid,target_plan uuid)
returns timestamptz
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_owner_hash text;
  v_email text;
  v_email_hash text;
  v_phone_hash text;
  v_finish timestamptz;
  v_seats integer;
begin
  if target_app not in ('zeus','artemis') then
    raise exception 'trial_app_unavailable';
  end if;

  if not exists(
    select 1 from public.accounts a
    where a.id=target_account and a.status='active'
  ) then raise exception 'trial_account_invalid'; end if;

  if not exists(
    select 1 from public.account_members m
    where m.account_id=target_account and m.user_id=target_user
      and m.role='owner' and m.status='active'
  ) then raise exception 'trial_owner_required'; end if;

  select p.seats into v_seats
  from public.plans p
  where p.id=target_plan and p.app_id=target_app and p.active=true;
  if v_seats is null then raise exception 'trial_plan_invalid'; end if;

  select i.document_hash into v_owner_hash
  from private.signup_identities i
  where i.account_id=target_account and i.user_id=target_user
  limit 1;
  if v_owner_hash is null then raise exception 'trial_identity_required'; end if;

  if not exists(
    select 1 from private.mp_trial_ip_locks l
    where l.account_id=target_account
      and l.user_id=target_user
      and l.first_app_id=target_app
  ) then raise exception 'trial_network_required'; end if;

  if not public.mp_trial_eligible(target_account,target_app,target_user) then
    raise exception 'trial_unavailable';
  end if;

  select lower(trim(u.email)) into v_email
  from auth.users u where u.id=target_user and u.email_confirmed_at is not null;
  if nullif(v_email,'') is null then raise exception 'trial_email_required'; end if;

  v_email_hash := private.antifraud_hmac(v_email);
  v_phone_hash := private.antifraud_hmac('no-phone:'||target_user::text);

  perform pg_advisory_xact_lock(hashtextextended('trial:'||target_account::text,0));
  perform pg_advisory_xact_lock(hashtextextended(target_account::text||':'||target_app,0));

  if not private.claim_trial_identity(target_account,target_app,target_user,'direct',null) then
    raise exception 'trial_already_used';
  end if;

  begin
    insert into private.app_trials(account_id,app_id,user_id,phone_hash,email_hash,document_hash)
    values(target_account,target_app,target_user,v_phone_hash,v_email_hash,v_owner_hash)
    returning ends_at into v_finish;
  exception when unique_violation then
    raise exception 'trial_already_used';
  end;

  insert into public.account_apps(account_id,app_id,plan_id,status,current_period_end,seats)
  values(target_account,target_app,target_plan,'trialing',v_finish,v_seats)
  on conflict(account_id,app_id) do update
    set plan_id=excluded.plan_id,
        status='trialing',
        current_period_end=excluded.current_period_end,
        seats=excluded.seats,
        updated_at=now()
    where public.account_apps.status<>'suspended'
      and (public.account_apps.current_period_end is null or public.account_apps.current_period_end<=now());

  if not found then
    delete from private.app_trials where account_id=target_account and app_id=target_app;
    raise exception 'trial_unavailable';
  end if;

  return v_finish;
end;
$function$;

revoke all on function public.activate_verified_app_trial(uuid,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.activate_verified_app_trial(uuid,text,uuid,uuid) to service_role;

update public.mp_subscriptions
set status='failed', updated_at=now()
where trial_requested=true
  and dedicated_trial_plan=true
  and status in ('creating','pending')
  and trial_ends_at is null
  and current_period_end is null;
