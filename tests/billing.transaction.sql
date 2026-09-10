begin;
do $test$
declare a uuid:=gen_random_uuid(); a2 uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); s uuid; pl uuid; remote jsonb; pay jsonb; ending timestamptz; t timestamptz:=now(); count_rows int;
begin
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  insert into auth.users(id,email,aud,role,created_at,updated_at) values(u,'billing-test-'||u||'@example.invalid','authenticated','authenticated',t,t);
  insert into public.accounts(id,name) values(a,'Billing transaction test'),(a2,'Other billing transaction test');
  insert into public.account_members(account_id,user_id,role) values(a,u,'owner');
  select id into strict pl from public.plans where app_id='zeus' and billing_interval='monthly';
  insert into public.mp_subscriptions(account_id,app_id,plan_id,amount_cents,currency,frequency)
    values(a,'zeus',pl,5000,'BRL',1) returning id into s;
  insert into public.mp_subscriptions(account_id,app_id,plan_id,amount_cents,currency,frequency) values(a2,'zeus',pl,5000,'BRL',1);
  begin
    insert into public.mp_subscriptions(account_id,app_id,plan_id,amount_cents,currency,frequency) values(a,'zeus',pl,5000,'BRL',1);
    raise exception 'Duplicate subscription accepted';
  exception when unique_violation then null; end;
  remote:=jsonb_build_object('id','test-'||s,'external_reference',s,'application_id','4059087158712728',
    'status','authorized','last_modified',t,'auto_recurring',jsonb_build_object('transaction_amount',50,'currency_id','BRL','frequency',1,'frequency_type','months'));
  perform public.mp_apply_snapshot(s,remote,null);
  if exists(select 1 from public.account_apps where account_id=a) then raise exception 'Authorization granted unpaid access'; end if;
  pay:=jsonb_build_object('id','test-payment-'||s,'status','approved','transaction_amount',50,'currency_id','BRL','date_approved',t,'date_last_updated',t);
  perform public.mp_apply_snapshot(s,remote,pay);
  select current_period_end into ending from public.account_apps where account_id=a and app_id='zeus' and status='active';
  if ending is distinct from t+interval '1 month' then raise exception 'Wrong paid period'; end if;
  perform public.mp_apply_snapshot(s,remote,pay);
  select count(*) into count_rows from public.mp_payments where subscription_id=s;
  if count_rows<>1 then raise exception 'Duplicate payment'; end if;
  begin
    perform public.mp_apply_snapshot(s,remote,jsonb_set(pay,'{transaction_amount}','1'));
    raise exception 'Underpayment accepted';
  exception when others then
    if sqlerrm<>'Invalid payment amount or currency' then raise; end if;
  end;
  remote:=remote||jsonb_build_object('status','cancelled','last_modified',t+interval '1 second');
  perform public.mp_apply_snapshot(s,remote,null);
  if (select status from public.account_apps where account_id=a and app_id='zeus')<>'active' then raise exception 'Cancellation removed paid access'; end if;
  perform public.mp_apply_snapshot(s,remote||jsonb_build_object('status','authorized','last_modified',t),null);
  if (select status from public.mp_subscriptions where id=s)<>'cancelled' then raise exception 'Stale status replaced cancellation'; end if;
  perform public.mp_apply_snapshot(s,remote,pay||jsonb_build_object('status','refunded','date_last_updated',t+interval '2 seconds'));
  if (select status from public.account_apps where account_id=a and app_id='zeus')<>'past_due' then raise exception 'Refund left access active'; end if;
  perform public.mp_apply_snapshot(s,remote,pay);
  if (select status from public.account_apps where account_id=a and app_id='zeus')<>'past_due' then raise exception 'Stale payment reversed refund'; end if;
  -- Restore a paid period to verify RLS owner access and expiry helpers below.
  perform public.mp_apply_snapshot(s,remote,pay||jsonb_build_object('date_last_updated',t+interval '3 seconds'));
  perform set_config('billing.test_account',a::text,true);
  perform set_config('billing.test_subscription',s::text,true);
  if has_table_privilege('authenticated','public.mp_subscriptions','INSERT')
    or has_table_privilege('authenticated','public.mp_payments','SELECT')
    or has_function_privilege('authenticated','public.mp_apply_snapshot(uuid,jsonb,jsonb)','EXECUTE')
    or has_function_privilege('anon','public.mp_apply_snapshot(uuid,jsonb,jsonb)','EXECUTE')
    then raise exception 'Client has privileged billing access'; end if;
end;
$test$;
set local role authenticated;
do $test$
begin
  if (select count(*) from public.mp_subscriptions)<>1 then raise exception 'Billing RLS leaks another account'; end if;
  if not private.can_access_app(current_setting('billing.test_account')::uuid,'zeus') then raise exception 'Owner denied paid app'; end if;
end;
$test$;
reset role;
update public.account_apps set current_period_end=now()-interval '1 second' where account_id=current_setting('billing.test_account')::uuid;
set local role authenticated;
do $test$
begin
  if private.can_access_app(current_setting('billing.test_account')::uuid,'zeus') then raise exception 'Expired app permitted'; end if;
end;
$test$;
reset role;
rollback;
