alter table public.plans add column if not exists plan_code text;
alter table public.plans add column if not exists seats integer not null default 1;

alter table public.plans drop constraint if exists plans_app_id_billing_interval_key;
alter table public.plans drop constraint if exists plans_seats_check;
alter table public.plans add constraint plans_seats_check check (seats > 0 and seats <= 1000);

drop index if exists public.plans_active_base_cycle_key;
drop index if exists public.plans_active_tier_cycle_key;
create unique index plans_active_base_cycle_key on public.plans(app_id,billing_interval) where active = true and plan_code is null;
create unique index plans_active_tier_cycle_key on public.plans(app_id,plan_code,billing_interval) where active = true and plan_code is not null;

update public.plans
set active=false, updated_at=now()
where app_id='zeus' and active=true and plan_code is null;

insert into public.plans(app_id,plan_code,billing_interval,amount_cents,currency,active,seats)
values
 ('zeus','start','monthly',2999,'brl',true,1),
 ('zeus','essencial','monthly',4999,'brl',true,2),
 ('zeus','plus','monthly',6499,'brl',true,4),
 ('zeus','premium','monthly',8999,'brl',true,10);

update public.mp_subscriptions ms
set status='failed', init_point=null, updated_at=now()
where ms.app_id='zeus'
  and ms.status='pending'
  and ms.preapproval_id is null
  and exists (
    select 1 from public.plans p
    where p.id=ms.plan_id and p.active=false and p.plan_code is null
  );

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
  plan_seats integer := 1;
begin
  select * into strict s from public.mp_subscriptions where id=local_id;
  select coalesce(pl.seats,1) into plan_seats from public.plans pl where pl.id=s.plan_id;
  plan_seats := coalesce(plan_seats,1);
  if not s.trial_requested then return false; end if;
  if exists(select 1 from private.mp_checkout_trials t where t.subscription_id=s.id) then return true; end if;
  if p is null then return false; end if;
  if trial_ends is null or trial_ends <= now()+interval '6 days' or trial_ends > now()+interval '8 days' then return false; end if;

  uid:=s.created_by_user_id;
  if uid is null then
    select m.user_id into uid from public.account_members m
    where m.account_id=s.account_id and m.role='owner' and m.status='active'
    order by m.created_at limit 1;
  end if;
  if uid is null then return false; end if;
  if not exists(select 1 from private.mp_trial_ip_locks l where l.account_id=s.account_id) then return false; end if;
  if not private.claim_trial_identity(s.account_id,s.app_id,uid,'mercadopago',s.id) then return false; end if;

  perform pg_advisory_xact_lock(hashtextextended('mp-trial-account:'||s.account_id::text||':'||s.app_id,0));
  perform pg_advisory_xact_lock(hashtextextended('mp-trial-user:'||uid::text||':'||s.app_id,0));
  perform pg_advisory_xact_lock(hashtextextended('mp-trial-payer:'||p||':'||s.app_id,0));
  if c is not null then perform pg_advisory_xact_lock(hashtextextended('mp-trial-card:'||c||':'||s.app_id,0)); end if;

  if exists(select 1 from public.account_apps aa where aa.account_id=s.account_id and aa.app_id=s.app_id) then return false; end if;
  if exists(select 1 from private.app_trials t where t.app_id=s.app_id and (t.account_id=s.account_id or t.user_id=uid)) then return false; end if;
  if exists(select 1 from private.mp_checkout_trials t where t.app_id=s.app_id and (
      t.account_id=s.account_id or t.user_id=uid or t.payer_id=p or (c is not null and t.card_id=c)
  )) then return false; end if;

  begin
    insert into private.mp_checkout_trials(subscription_id,account_id,app_id,user_id,payer_id,card_id,phone_hash,document_hash,ends_at)
    values(s.id,s.account_id,s.app_id,uid,p,c,null,null,trial_ends);
  exception when unique_violation then
    return false;
  end;

  update private.mp_trial_ip_locks set first_subscription_id=coalesce(first_subscription_id,s.id)
  where account_id=s.account_id;

  insert into public.account_apps(account_id,app_id,plan_id,status,current_period_end,seats)
  values(s.account_id,s.app_id,s.plan_id,'trialing',trial_ends,plan_seats)
  on conflict(account_id,app_id) do nothing;
  if not found then
    delete from private.mp_checkout_trials where subscription_id=s.id;
    return false;
  end if;

  update public.mp_subscriptions set trial_ends_at=trial_ends,updated_at=now() where id=s.id;
  return true;
end;
$$;

create or replace function public.mp_apply_snapshot(local_id uuid, subscription jsonb, payment jsonb default null::jsonb)
returns void
language plpgsql
set search_path=''
as $$
declare
  s public.mp_subscriptions%rowtype;
  entitlement record;
  paid_until timestamptz;
  p_status text;
  p_date timestamptz;
  p_updated timestamptz;
  s_updated timestamptz;
  correlated boolean;
begin
  select * into strict s from public.mp_subscriptions where id=local_id;
  perform pg_advisory_xact_lock(hashtextextended(s.account_id::text || ':' || s.app_id,0));
  select * into strict s from public.mp_subscriptions where id=local_id for update;

  correlated := subscription->>'external_reference' = s.id::text
    or (
      s.dedicated_trial_plan = true
      and s.preapproval_plan_id is not null
      and subscription->>'preapproval_plan_id' = s.preapproval_plan_id
    )
    or (
      s.preapproval_plan_id is not null
      and nullif(s.payer_email,'') is not null
      and subscription->>'preapproval_plan_id' = s.preapproval_plan_id
      and lower(coalesce(subscription->>'payer_email','')) = lower(s.payer_email)
    );

  if not correlated
    or (s.preapproval_id is not null and subscription->>'id' is distinct from s.preapproval_id)
    or nullif(subscription->>'id','') is null
    or subscription->>'application_id' is distinct from '4059087158712728'
    or round((subscription#>>'{auto_recurring,transaction_amount}')::numeric*100)::integer is distinct from s.amount_cents
    or subscription#>>'{auto_recurring,currency_id}' is distinct from s.currency
    or (subscription#>>'{auto_recurring,frequency}')::integer is distinct from s.frequency
    or subscription#>>'{auto_recurring,frequency_type}' is distinct from 'months'
    then raise exception 'Invalid subscription correlation'; end if;

  s_updated := (subscription->>'last_modified')::timestamptz;
  if s_updated is null then raise exception 'Missing subscription version'; end if;

  update public.mp_subscriptions set
    preapproval_id=subscription->>'id', status=subscription->>'status',
    init_point=coalesce(subscription->>'init_point',init_point),
    provider_updated_at=s_updated,updated_at=now()
    where id=s.id and (provider_updated_at is null or provider_updated_at<=s_updated);

  if payment is not null then
    if nullif(payment->>'id','') is null
      or payment->>'currency_id' is distinct from s.currency
      or round((payment->>'transaction_amount')::numeric*100)::integer is distinct from s.amount_cents
      then raise exception 'Invalid payment amount or currency'; end if;
    p_status := payment->>'status';
    if coalesce((payment->>'transaction_amount_refunded')::numeric,0)>0 then p_status := 'refunded'; end if;
    p_date := (payment->>'date_approved')::timestamptz;
    p_updated := (payment->>'date_last_updated')::timestamptz;
    if p_updated is null or (p_status='approved' and p_date is null)
      then raise exception 'Missing payment version'; end if;
    if exists(select 1 from public.mp_payments where id=payment->>'id' and subscription_id<>s.id)
      then raise exception 'Payment already belongs to another subscription'; end if;
    insert into public.mp_payments(id,subscription_id,status,amount_cents,paid_at,period_end,provider_updated_at)
    values(payment->>'id',s.id,p_status,s.amount_cents,p_date,
      case when p_status='approved' then p_date+make_interval(months=>s.frequency) else null end,p_updated)
    on conflict(id) do update set status=excluded.status,paid_at=excluded.paid_at,
      period_end=excluded.period_end,provider_updated_at=excluded.provider_updated_at,updated_at=now()
      where public.mp_payments.provider_updated_at<=excluded.provider_updated_at;
  end if;

  select max(period_end) into paid_until from public.mp_payments where subscription_id=s.id and status='approved';
  update public.mp_subscriptions set current_period_end=paid_until where id=s.id;

  select ms.plan_id,ms.current_period_end,coalesce(pl.seats,1) as seats into entitlement
    from public.mp_subscriptions ms
    left join public.plans pl on pl.id=ms.plan_id
    where ms.account_id=s.account_id and ms.app_id=s.app_id and ms.current_period_end>now()
    order by ms.current_period_end desc limit 1;
  if found then
    insert into public.account_apps(account_id,app_id,plan_id,status,current_period_end,seats)
      values(s.account_id,s.app_id,entitlement.plan_id,'active',entitlement.current_period_end,entitlement.seats)
    on conflict(account_id,app_id) do update set plan_id=excluded.plan_id,status='active',
      current_period_end=excluded.current_period_end,seats=excluded.seats,updated_at=now()
      where public.account_apps.status<>'suspended';
  else
    update public.account_apps set status='past_due',current_period_end=paid_until,updated_at=now()
      where account_id=s.account_id and app_id=s.app_id and status not in ('suspended','trialing');
  end if;
end;
$$;
