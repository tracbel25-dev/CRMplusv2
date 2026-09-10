-- Applied to the central Store project only. No operational app data.
begin;
create table public.mp_subscriptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id),
  app_id text not null references public.apps(id),
  plan_id uuid not null references public.plans(id),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null check (currency = 'BRL'),
  frequency integer not null check (frequency in (1,6,12)),
  preapproval_id text unique,
  status text not null default 'creating' check (status in ('creating','pending','authorized','paused','cancelled','failed')),
  init_point text,
  provider_updated_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index mp_one_open_subscription on public.mp_subscriptions(account_id,app_id)
  where status in ('creating','pending','authorized','paused');
create index mp_subscriptions_plan on public.mp_subscriptions(plan_id);
create index mp_subscriptions_app on public.mp_subscriptions(app_id);
alter table public.mp_subscriptions enable row level security;
revoke all on public.mp_subscriptions from public, anon, authenticated;
grant select on public.mp_subscriptions to authenticated;
grant all on public.mp_subscriptions to service_role;
create policy mp_billing_read on public.mp_subscriptions for select to authenticated
  using (private.has_account_permission(account_id,'manage_billing'));

create table public.mp_payments (
  id text primary key,
  subscription_id uuid not null references public.mp_subscriptions(id),
  status text not null,
  amount_cents integer not null,
  paid_at timestamptz,
  period_end timestamptz,
  provider_updated_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index mp_payments_subscription on public.mp_payments(subscription_id);
alter table public.mp_payments enable row level security;
revoke all on public.mp_payments from public, anon, authenticated;
grant all on public.mp_payments to service_role;

-- One transaction serializes subscription/payment updates and entitlement changes.
-- INVOKER: callable only by the backend service role, never by the browser.
create function public.mp_apply_snapshot(local_id uuid, subscription jsonb, payment jsonb default null)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  s public.mp_subscriptions%rowtype;
  entitlement record;
  paid_until timestamptz;
  p_status text;
  p_date timestamptz;
  p_updated timestamptz;
  s_updated timestamptz;
begin
  select * into strict s from public.mp_subscriptions where id=local_id;
  perform pg_advisory_xact_lock(hashtextextended(s.account_id::text || ':' || s.app_id,0));
  select * into strict s from public.mp_subscriptions where id=local_id for update;
  if subscription->>'external_reference' is distinct from s.id::text
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
  -- A cancelled renewal keeps the period already paid. Authorization alone grants nothing.
  select ms.plan_id,ms.current_period_end into entitlement from public.mp_subscriptions ms
    where ms.account_id=s.account_id and ms.app_id=s.app_id and ms.current_period_end>now()
    order by ms.current_period_end desc limit 1;
  if found then
    insert into public.account_apps(account_id,app_id,plan_id,status,current_period_end)
      values(s.account_id,s.app_id,entitlement.plan_id,'active',entitlement.current_period_end)
    on conflict(account_id,app_id) do update set plan_id=excluded.plan_id,status='active',
      current_period_end=excluded.current_period_end,updated_at=now()
      where public.account_apps.status<>'suspended';
  else
    update public.account_apps set status='past_due',current_period_end=paid_until,updated_at=now()
      where account_id=s.account_id and app_id=s.app_id and status<>'suspended';
  end if;
end;
$$;
revoke all on function public.mp_apply_snapshot(uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.mp_apply_snapshot(uuid,jsonb,jsonb) to service_role;

-- Expiry must be checked on access even when a provider notification is delayed.
create or replace function private.can_access_app(target_account uuid,target_app text)
returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.account_apps aa join public.accounts a on a.id=aa.account_id
    join public.account_members m on m.account_id=a.id and m.user_id=(select auth.uid())
    where aa.account_id=target_account and aa.app_id=target_app
      and aa.status in ('trialing','active') and a.status='active' and m.status='active'
      and (aa.current_period_end is null or aa.current_period_end>now())
      and (private.is_account_owner(target_account) or exists (
        select 1 from public.member_app_access ma where ma.account_id=target_account
          and ma.user_id=(select auth.uid()) and ma.app_id=target_app))
  );
$$;
create or replace function private.can_configure_app(target_account uuid,target_app text)
returns boolean language sql stable security definer set search_path='' as $$
  select private.can_access_app(target_account,target_app) and (
    private.is_account_owner(target_account) or exists (
      select 1 from public.member_app_access ma where ma.account_id=target_account
        and ma.user_id=(select auth.uid()) and ma.app_id=target_app and ma.can_configure
    ));
$$;
commit;
