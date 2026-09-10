begin;

alter table public.mp_subscriptions
  add column if not exists payer_email text;

update public.mp_subscriptions s
set payer_email = lower(u.email)
from auth.users u
where s.created_by_user_id = u.id
  and s.payer_email is null
  and u.email is not null;

create index if not exists mp_subscriptions_plan_payer_created
  on public.mp_subscriptions(preapproval_plan_id, lower(payer_email), created_at desc)
  where preapproval_plan_id is not null and payer_email is not null;

create or replace function public.mp_apply_snapshot(local_id uuid, subscription jsonb, payment jsonb default null)
returns void
language plpgsql security invoker set search_path = '' as $$
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
      where account_id=s.account_id and app_id=s.app_id and status not in ('suspended','trialing');
  end if;
end;
$$;

commit;
