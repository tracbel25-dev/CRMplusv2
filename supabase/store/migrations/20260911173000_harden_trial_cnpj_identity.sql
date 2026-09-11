begin;

-- CNPJ is the durable company identity for trial eligibility.
alter table public.accounts add column if not exists cnpj text;

create or replace function public.valid_cnpj(value text)
returns boolean
language plpgsql
immutable
security invoker
set search_path=''
as $$
declare
  d text := regexp_replace(coalesce(value,''),'[^0-9]','','g');
  i int; total int := 0; weight int; remainder int; check1 int; check2 int;
begin
  if length(d) <> 14 or d = repeat(substr(d,1,1),14) then return false; end if;
  weight := 5;
  for i in 1..12 loop
    total := total + substr(d,i,1)::int * weight;
    weight := weight - 1;
    if weight = 1 then weight := 9; end if;
  end loop;
  remainder := total % 11;
  check1 := case when remainder < 2 then 0 else 11 - remainder end;
  if check1 <> substr(d,13,1)::int then return false; end if;
  total := 0; weight := 6;
  for i in 1..13 loop
    total := total + substr(d,i,1)::int * weight;
    weight := weight - 1;
    if weight = 1 then weight := 9; end if;
  end loop;
  remainder := total % 11;
  check2 := case when remainder < 2 then 0 else 11 - remainder end;
  return check2 = substr(d,14,1)::int;
end;
$$;

revoke all on function public.valid_cnpj(text) from public, anon;
grant execute on function public.valid_cnpj(text) to authenticated, service_role;

alter table public.accounts drop constraint if exists accounts_cnpj_valid;
alter table public.accounts add constraint accounts_cnpj_valid
  check (cnpj is null or (cnpj ~ '^[0-9]{14}$' and public.valid_cnpj(cnpj)));

-- Refuse to silently choose between duplicate company identities already present.
do $$
begin
  if exists (
    select 1 from public.accounts
    where cnpj is not null
    group by cnpj
    having count(*) > 1
  ) then
    raise exception 'duplicate_account_cnpj_requires_review';
  end if;
end;
$$;

create unique index if not exists accounts_cnpj_unique
  on public.accounts(cnpj)
  where cnpj is not null;

-- One durable claim unifies direct trial and Mercado Pago trial paths.
create table if not exists private.trial_identity_claims (
  app_id text not null,
  company_hash text not null,
  owner_document_hash text not null,
  account_id uuid not null,
  user_id uuid not null,
  source text not null check (source in ('direct','mercadopago')),
  source_id uuid,
  created_at timestamptz not null default now(),
  primary key (app_id, company_hash),
  unique (app_id, owner_document_hash),
  unique (app_id, user_id)
);

alter table private.trial_identity_claims enable row level security;
revoke all on private.trial_identity_claims from public, anon, authenticated;
grant select, insert on private.trial_identity_claims to service_role;

create or replace function private.claim_trial_identity(
  target_account uuid,
  target_app text,
  target_user uuid,
  claim_source text,
  claim_source_id uuid default null
) returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  company_document text;
  company_hash text;
  owner_hash text;
  existing private.trial_identity_claims%rowtype;
begin
  if target_app not in ('zeus','artemis') then return false; end if;
  if claim_source not in ('direct','mercadopago') then return false; end if;

  select a.cnpj into company_document
  from public.accounts a
  where a.id = target_account and a.status = 'active';
  if company_document is null or not public.valid_cnpj(company_document) then return false; end if;

  if not exists (
    select 1 from public.account_members m
    where m.account_id=target_account and m.user_id=target_user
      and m.role='owner' and m.status='active'
  ) then return false; end if;

  select i.document_hash into owner_hash
  from private.signup_identities i
  where i.account_id=target_account and i.user_id=target_user
  limit 1;
  if owner_hash is null then return false; end if;

  company_hash := private.antifraud_hmac(company_document);
  perform pg_advisory_xact_lock(hashtextextended('trial-company:'||target_app||':'||company_hash,0));
  perform pg_advisory_xact_lock(hashtextextended('trial-owner:'||target_app||':'||owner_hash,0));
  perform pg_advisory_xact_lock(hashtextextended('trial-user:'||target_app||':'||target_user::text,0));

  select * into existing
  from private.trial_identity_claims c
  where c.app_id=target_app
    and (c.company_hash=company_hash or c.owner_document_hash=owner_hash or c.user_id=target_user)
  limit 1;

  if found then
    return existing.account_id=target_account and existing.user_id=target_user;
  end if;

  begin
    insert into private.trial_identity_claims(
      app_id,company_hash,owner_document_hash,account_id,user_id,source,source_id
    ) values(
      target_app,company_hash,owner_hash,target_account,target_user,claim_source,claim_source_id
    );
  exception when unique_violation then
    return false;
  end;
  return true;
end;
$$;

revoke all on function private.claim_trial_identity(uuid,text,uuid,text,uuid) from public, anon, authenticated;
grant execute on function private.claim_trial_identity(uuid,text,uuid,text,uuid) to service_role;

-- Pre-check used by the Edge Function now includes company + owner identity claims.
create or replace function public.mp_trial_eligible(target_account uuid, target_app text, target_user uuid)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  company_document text;
  company_hash text;
  owner_hash text;
begin
  select a.cnpj into company_document
  from public.accounts a
  where a.id=target_account and a.status='active';
  if company_document is null or not public.valid_cnpj(company_document) then return false; end if;

  select i.document_hash into owner_hash
  from private.signup_identities i
  where i.account_id=target_account and i.user_id=target_user
  limit 1;
  if owner_hash is null then return false; end if;
  company_hash := private.antifraud_hmac(company_document);

  return not exists (
      select 1 from public.account_apps aa
      where aa.account_id=target_account and aa.app_id=target_app
    )
    and not exists (
      select 1 from private.app_trials t
      where t.app_id=target_app and (t.account_id=target_account or t.user_id=target_user)
    )
    and not exists (
      select 1 from private.mp_checkout_trials t
      where t.app_id=target_app and (t.account_id=target_account or t.user_id=target_user)
    )
    and not exists (
      select 1 from private.trial_identity_claims c
      where c.app_id=target_app
        and (c.company_hash=company_hash or c.owner_document_hash=owner_hash or c.user_id=target_user)
    );
end;
$$;
revoke all on function public.mp_trial_eligible(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.mp_trial_eligible(uuid,text,uuid) to service_role;

-- Secure direct trial: document is derived from the validated account/owner records,
-- never from an arbitrary value sent by the browser.
create or replace function private.start_app_trial(target_account uuid,target_app text)
returns timestamptz
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid := (select auth.uid());
  u auth.users%rowtype;
  k bytea;
  ph text;
  eh text;
  owner_hash text;
  finish timestamptz;
begin
  if uid is null then raise exception 'trial_auth_required'; end if;
  if not private.is_account_owner(target_account)
     or not exists(select 1 from public.accounts where id=target_account and status='active')
    then raise exception 'trial_owner_required'; end if;
  if target_app not in ('zeus','artemis') then raise exception 'trial_app_unavailable'; end if;

  select * into strict u from auth.users where id=uid;
  if u.is_anonymous or u.email_confirmed_at is null or nullif(u.email,'') is null
    then raise exception 'trial_email_required'; end if;
  if u.phone_confirmed_at is null or nullif(u.phone,'') is null
    then raise exception 'trial_phone_required'; end if;

  if not exists(select 1 from public.accounts where id=target_account and cnpj is not null and public.valid_cnpj(cnpj))
    then raise exception 'trial_cnpj_required'; end if;

  select i.document_hash into owner_hash
  from private.signup_identities i
  where i.user_id=uid and i.account_id=target_account
  limit 1;
  if owner_hash is null then raise exception 'trial_identity_required'; end if;

  -- The direct path must reserve the network first through trial-antifraud.
  if not exists(select 1 from private.mp_trial_ip_locks l where l.account_id=target_account)
    then raise exception 'trial_network_required'; end if;

  select secret into strict k from private.trial_key where singleton;
  ph:=encode(extensions.hmac(regexp_replace(u.phone,'[^0-9]','','g'),encode(k,'hex'),'sha256'),'hex');
  eh:=encode(extensions.hmac(lower(trim(u.email)),encode(k,'hex'),'sha256'),'hex');

  perform pg_advisory_xact_lock(hashtextextended('trial:'||target_account::text,0));
  perform pg_advisory_xact_lock(hashtextextended(target_account::text||':'||target_app,0));

  if exists(select 1 from public.account_apps where account_id=target_account and app_id=target_app and status='suspended')
    then raise exception 'trial_unavailable'; end if;
  if exists(select 1 from public.account_apps where account_id=target_account and app_id=target_app and status='active' and (current_period_end is null or current_period_end>now()))
    then raise exception 'trial_already_active'; end if;

  select ends_at into finish from private.app_trials
  where account_id=target_account and app_id=target_app;
  if found then
    if finish<=now() then raise exception 'trial_already_used'; end if;
    return finish;
  end if;

  if exists(select 1 from public.account_apps where account_id=target_account and app_id=target_app)
    then raise exception 'trial_already_used'; end if;

  if not private.claim_trial_identity(target_account,target_app,uid,'direct',null)
    then raise exception 'trial_already_used'; end if;

  begin
    insert into private.app_trials(account_id,app_id,user_id,phone_hash,email_hash,document_hash)
    values(target_account,target_app,uid,ph,eh,owner_hash)
    returning ends_at into finish;
  exception when unique_violation then
    raise exception 'trial_already_used';
  end;

  insert into public.account_apps(account_id,app_id,status,current_period_end)
  values(target_account,target_app,'trialing',finish);
  return finish;
end;
$$;
revoke all on function private.start_app_trial(uuid,text) from public, anon, authenticated;

create or replace function public.start_app_trial(target_account uuid,target_app text)
returns timestamptz
language sql
security invoker
set search_path=''
as $$ select private.start_app_trial(target_account,target_app); $$;
revoke all on function public.start_app_trial(uuid,text) from public, anon;
grant execute on function public.start_app_trial(uuid,text) to authenticated;

-- Compatibility for already deployed clients: supplied document is intentionally ignored.
create or replace function public.start_app_trial(target_account uuid,target_app text,document text)
returns timestamptz
language sql
security invoker
set search_path=''
as $$ select private.start_app_trial(target_account,target_app); $$;
revoke all on function public.start_app_trial(uuid,text,text) from public, anon;
grant execute on function public.start_app_trial(uuid,text,text) to authenticated;

-- Mercado Pago activation consumes the exact same company/owner identity claim.
create or replace function public.mp_register_checkout_trial(local_id uuid, provider_payer_id text, provider_card_id text, trial_ends timestamptz)
returns boolean
language plpgsql
security invoker
set search_path=''
as $$
declare
  s public.mp_subscriptions%rowtype;
  uid uuid;
  p text := nullif(trim(provider_payer_id), '');
  c text := nullif(trim(provider_card_id), '');
begin
  select * into strict s from public.mp_subscriptions where id=local_id;
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

  insert into public.account_apps(account_id,app_id,plan_id,status,current_period_end)
  values(s.account_id,s.app_id,s.plan_id,'trialing',trial_ends)
  on conflict(account_id,app_id) do nothing;
  if not found then
    delete from private.mp_checkout_trials where subscription_id=s.id;
    return false;
  end if;

  update public.mp_subscriptions set trial_ends_at=trial_ends,updated_at=now() where id=s.id;
  return true;
end;
$$;
revoke all on function public.mp_register_checkout_trial(uuid,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.mp_register_checkout_trial(uuid,text,text,timestamptz) to service_role;

commit;
