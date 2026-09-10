begin;

alter table public.mp_subscriptions
  add column if not exists trial_requested boolean not null default false,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists preapproval_plan_id text;

update public.mp_subscriptions s
set created_by_user_id = (
  select m.user_id
  from public.account_members m
  where m.account_id = s.account_id and m.role = 'owner' and m.status = 'active'
  order by m.created_at
  limit 1
)
where s.created_by_user_id is null;

create table if not exists public.mp_plan_mappings (
  plan_id uuid primary key references public.plans(id) on delete cascade,
  preapproval_plan_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.mp_plan_mappings enable row level security;
revoke all on public.mp_plan_mappings from public, anon, authenticated;
grant all on public.mp_plan_mappings to service_role;

create table if not exists private.mp_checkout_trials (
  subscription_id uuid primary key references public.mp_subscriptions(id),
  account_id uuid not null,
  app_id text not null,
  user_id uuid not null,
  payer_id text,
  card_id text,
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  check (ends_at > started_at)
);
create unique index if not exists mp_checkout_trial_account_app on private.mp_checkout_trials(account_id, app_id);
create unique index if not exists mp_checkout_trial_user_app on private.mp_checkout_trials(user_id, app_id);
create unique index if not exists mp_checkout_trial_payer_app on private.mp_checkout_trials(payer_id, app_id) where payer_id is not null;
create unique index if not exists mp_checkout_trial_card_app on private.mp_checkout_trials(card_id, app_id) where card_id is not null;
alter table private.mp_checkout_trials enable row level security;
revoke all on private.mp_checkout_trials from public, anon, authenticated;
grant select, insert, update on private.mp_checkout_trials to service_role;

create or replace function public.mp_trial_eligible(target_account uuid, target_app text, target_user uuid)
returns boolean
language sql stable security invoker set search_path = '' as $$
  select
    not exists (
      select 1 from public.account_apps aa
      where aa.account_id = target_account and aa.app_id = target_app
    )
    and not exists (
      select 1 from private.app_trials t
      where t.app_id = target_app and (t.account_id = target_account or t.user_id = target_user)
    )
    and not exists (
      select 1 from private.mp_checkout_trials t
      where t.app_id = target_app and (t.account_id = target_account or t.user_id = target_user)
    );
$$;
revoke all on function public.mp_trial_eligible(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.mp_trial_eligible(uuid,text,uuid) to service_role;

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
begin
  select * into strict s from public.mp_subscriptions where id = local_id;
  if not s.trial_requested then return false; end if;
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

  perform pg_advisory_xact_lock(hashtextextended('mp-trial-account:' || s.account_id::text || ':' || s.app_id, 0));
  perform pg_advisory_xact_lock(hashtextextended('mp-trial-user:' || uid::text || ':' || s.app_id, 0));
  if p is not null then perform pg_advisory_xact_lock(hashtextextended('mp-trial-payer:' || p || ':' || s.app_id, 0)); end if;
  if c is not null then perform pg_advisory_xact_lock(hashtextextended('mp-trial-card:' || c || ':' || s.app_id, 0)); end if;

  if exists (select 1 from private.mp_checkout_trials t where t.subscription_id = s.id) then
    return true;
  end if;
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
      t.account_id = s.account_id or t.user_id = uid
      or (p is not null and t.payer_id = p)
      or (c is not null and t.card_id = c)
    )
  ) then return false; end if;

  begin
    insert into private.mp_checkout_trials(subscription_id,account_id,app_id,user_id,payer_id,card_id,ends_at)
    values (s.id,s.account_id,s.app_id,uid,p,c,trial_ends);
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
