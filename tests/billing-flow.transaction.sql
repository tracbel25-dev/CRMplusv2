-- Mirrors the Edge Function's invoker role; all fixtures are rolled back.
begin;
set local role service_role;
select public.mp_trial_eligible('00000000-0000-0000-0000-000000000001',id,'00000000-0000-0000-0000-000000000001') from public.apps where status='active';
select public.mp_prepare_trial_identity('00000000-0000-0000-0000-000000000001','zeus','00000000-0000-0000-0000-000000000001','5591999999999','52998224725',null);
reset role;
do $$
declare a uuid:=gen_random_uuid(); s uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); p public.plans%rowtype; result boolean; old_end timestamptz:=now()+interval '2 days';
begin
 select * into strict p from public.plans where app_id='zeus' and billing_interval='monthly' limit 1;
 insert into public.accounts(id,name,status) values(a,'Billing flow rollback test','active');
 insert into public.mp_subscriptions(id,account_id,app_id,plan_id,amount_cents,currency,frequency,status,trial_requested,trial_ends_at)
 values(s,a,'zeus',p.id,p.amount_cents,'BRL',1,'authorized',true,old_end);
 insert into private.mp_checkout_trials(subscription_id,account_id,app_id,user_id,started_at,ends_at)
 values(s,a,'zeus',u,now()-interval '5 days',old_end);
 execute 'set local role service_role';
 result:=public.mp_register_checkout_trial(s,'test-payer','test-card',old_end);
 if not result then raise exception 'Existing trial rejected after first day'; end if;
 result:=public.mp_register_checkout_trial(s,'test-payer','test-card',now()+interval '7 days');
 if not result then raise exception 'Repeated notification rejected'; end if;
 if (select ends_at from private.mp_checkout_trials where subscription_id=s)<>old_end then raise exception 'Trial deadline extended'; end if;
 execute 'reset role';
 if has_schema_privilege('anon','private','USAGE') or has_table_privilege('authenticated','private.trial_key','SELECT') then raise exception 'Private data exposed'; end if;
end; $$;
select 'passed: service-role list, identity validation, repeated trial notifications, fixed deadline, private data isolation' as result;
rollback;
