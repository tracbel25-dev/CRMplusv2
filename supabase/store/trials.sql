-- Central Store: seven-day, nonrenewable trials. Apply once, after mercadopago.sql.
begin;
-- No cascading FKs: deleting an account must not erase consumed trial identities.
create table private.trial_key (singleton boolean primary key default true check(singleton), secret bytea not null);
insert into private.trial_key values(true,extensions.gen_random_bytes(32));
create table private.app_trials (
 account_id uuid not null, app_id text not null, user_id uuid not null,
 phone_hash text not null, email_hash text not null, document_hash text not null,
 started_at timestamptz not null default now(), ends_at timestamptz not null default now()+interval '168 hours',
 primary key(account_id,app_id), unique(user_id,app_id), unique(phone_hash,app_id),
 unique(email_hash,app_id), unique(document_hash,app_id),
 check(ends_at=started_at+interval '168 hours')
);
alter table private.trial_key enable row level security;
alter table private.app_trials enable row level security;
revoke all on private.trial_key,private.app_trials from public,anon,authenticated;

create function private.valid_trial_document(value text) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare d text:=regexp_replace(value,'[^0-9]','','g'); n int; total int; digit int; i int; j int; weight int;
begin
 n:=length(d);
 if n not in (11,14) or d=repeat(substr(d,1,1),n) then return false; end if;
 for j in (n-1)..n loop
  total:=0;
  for i in 1..(j-1) loop
   weight:=case when n=11 then j+1-i else ((j-1-i)%8)+2 end;
   total:=total+substr(d,i,1)::int*weight;
  end loop;
  digit:=case when total%11<2 then 0 else 11-total%11 end;
  if substr(d,j,1)::int<>digit then return false; end if;
 end loop;
 return true;
end; $$;
revoke all on function private.valid_trial_document(text) from public,anon,authenticated;

create function private.start_app_trial(target_account uuid,target_app text,document text) returns timestamptz
language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=(select auth.uid()); u auth.users%rowtype; k bytea; ph text; eh text; dh text;
 finish timestamptz; d text:=regexp_replace(document,'[^0-9]','','g');
begin
 if uid is null then raise exception 'trial_auth_required'; end if;
 if not private.is_account_owner(target_account) or not exists(select 1 from public.accounts where id=target_account and status='active') then raise exception 'trial_owner_required'; end if;
 -- Only apps with an operational backend can be activated.
 if target_app not in ('zeus','artemis') then raise exception 'trial_app_unavailable'; end if;
 select * into strict u from auth.users where id=uid;
 if u.is_anonymous or u.email_confirmed_at is null or nullif(u.email,'') is null then raise exception 'trial_email_required'; end if;
 if u.phone_confirmed_at is null or nullif(u.phone,'') is null then raise exception 'trial_phone_required'; end if;
 if d is null or not private.valid_trial_document(d) then raise exception 'trial_document_invalid'; end if;
 select secret into strict k from private.trial_key where singleton;
 ph:=encode(extensions.hmac(regexp_replace(u.phone,'[^0-9]','','g'),encode(k,'hex'),'sha256'),'hex');
 eh:=encode(extensions.hmac(lower(trim(u.email)),encode(k,'hex'),'sha256'),'hex');
 dh:=encode(extensions.hmac(d,encode(k,'hex'),'sha256'),'hex');
 -- Same lock as Mercado Pago: a trial must never overwrite a paid entitlement.
 perform pg_advisory_xact_lock(hashtextextended('trial:'||target_account::text,0));
 perform pg_advisory_xact_lock(hashtextextended(target_account::text||':'||target_app,0));
 if exists(select 1 from public.account_apps where account_id=target_account and app_id=target_app and status='suspended') then raise exception 'trial_unavailable'; end if;
 if exists(select 1 from public.account_apps where account_id=target_account and app_id=target_app and status='active' and (current_period_end is null or current_period_end>now())) then raise exception 'trial_already_active'; end if;
 select ends_at into finish from private.app_trials where account_id=target_account and app_id=target_app;
 if found then
  if finish<=now() then raise exception 'trial_already_used'; end if;
  return finish; -- Retry does not restart or extend the period.
 end if;
 if exists(select 1 from private.app_trials where account_id=target_account and (document_hash<>dh or phone_hash<>ph)) then raise exception 'trial_identity_changed'; end if;
 if exists(select 1 from public.account_apps where account_id=target_account and app_id=target_app) then raise exception 'trial_already_used'; end if;
 begin
  insert into private.app_trials(account_id,app_id,user_id,phone_hash,email_hash,document_hash)
  values(target_account,target_app,uid,ph,eh,dh) returning ends_at into finish;
 exception when unique_violation then raise exception 'trial_already_used'; end;
 insert into public.account_apps(account_id,app_id,status,current_period_end)
 values(target_account,target_app,'trialing',finish);
 return finish;
end; $$;
revoke all on function private.start_app_trial(uuid,text,text) from public,anon;
grant execute on function private.start_app_trial(uuid,text,text) to authenticated;
create function public.start_app_trial(target_account uuid,target_app text,document text) returns timestamptz
language sql security invoker set search_path='' as $$ select private.start_app_trial(target_account,target_app,document); $$;
revoke all on function public.start_app_trial(uuid,text,text) from public,anon;
grant execute on function public.start_app_trial(uuid,text,text) to authenticated;

-- No cron is needed for access expiry: every server authorization checks the deadline.
create or replace function private.can_access_app(target_account uuid,target_app text)
returns boolean language sql stable security definer set search_path='' as $$
 select (select auth.uid()) is not null and exists (
 select 1 from public.account_apps aa join public.accounts a on a.id=aa.account_id
 join public.account_members m on m.account_id=a.id and m.user_id=(select auth.uid())
 where aa.account_id=target_account and aa.app_id=target_app and a.status='active' and m.status='active'
 and ((aa.status='active' and (aa.current_period_end is null or aa.current_period_end>now()))
   or (aa.status='trialing' and aa.current_period_end>now()))
 and (private.is_account_owner(target_account) or exists(select 1 from public.member_app_access ma where ma.account_id=target_account and ma.user_id=(select auth.uid()) and ma.app_id=target_app)));
$$;
-- A pending/cancelled checkout without payment must not revoke an ongoing trial.
do $$ declare body text; begin
 body:=pg_get_functiondef('public.mp_apply_snapshot(uuid,jsonb,jsonb)'::regprocedure);
 body:=replace(body,'where account_id=s.account_id and app_id=s.app_id and status<>''suspended'';',
 'where account_id=s.account_id and app_id=s.app_id and status not in (''suspended'',''trialing'');');
 execute body;
end; $$;
commit;
