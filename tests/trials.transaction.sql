-- Execute against Store as postgres. Synthetic fixtures are always rolled back.
begin;
do $$
declare
 u1 uuid:=gen_random_uuid(); u2 uuid:=gen_random_uuid(); a1 uuid:=gen_random_uuid(); a2 uuid:=gen_random_uuid();
 expiry timestamptz; retry timestamptz; phone1 text:='559'||lpad((floor(random()*1000000000))::text,10,'0');
 phone2 text:='559'||lpad((floor(random()*1000000000))::text,10,'0'); caught boolean;
begin
 if has_function_privilege('anon','public.start_app_trial(uuid,text,text)','EXECUTE') then raise exception 'anon can start trials'; end if;
 if has_table_privilege('authenticated','private.app_trials','SELECT') or has_table_privilege('authenticated','private.trial_key','SELECT') then raise exception 'identity exposure'; end if;
 if not private.valid_trial_document('52998224725') or not private.valid_trial_document('11222333000181') or private.valid_trial_document('11111111111') or private.valid_trial_document('52998224726') then raise exception 'document validator'; end if;
 insert into auth.users(id,email,email_confirmed_at,phone,is_anonymous)
 values(u1,u1::text||'@trial-test.invalid',now(),phone1,false),(u2,u2::text||'@trial-test.invalid',now(),phone2,false);
 insert into public.accounts(id,name,status) values(a1,'Trial rollback fixture','active'),(a2,'Trial rollback fixture','active');
 insert into public.account_members(account_id,user_id,role,status) values(a1,u1,'owner','active'),(a2,u2,'owner','active');
 perform set_config('request.jwt.claim.sub',u1::text,true);
 caught:=false;
 begin perform public.start_app_trial(a1,'zeus','52998224725'); exception when others then if sqlerrm<>'trial_phone_required' then raise; end if; caught:=true; end;
 if not caught then raise exception 'unverified phone accepted'; end if;
 update auth.users set phone_confirmed_at=now() where id in(u1,u2);
 caught:=false;
 begin perform public.start_app_trial(a2,'zeus','52998224725'); exception when others then if sqlerrm<>'trial_owner_required' then raise; end if; caught:=true; end;
 if not caught then raise exception 'cross tenant accepted'; end if;
 expiry:=public.start_app_trial(a1,'zeus','52998224725');
 if expiry<>now()+interval '168 hours' then raise exception 'duration'; end if;
 retry:=public.start_app_trial(a1,'zeus','52998224725');
 if expiry<>retry then raise exception 'retry extended deadline'; end if;
 if not private.can_access_app(a1,'zeus') then raise exception 'active trial denied'; end if;
 perform public.start_app_trial(a1,'artemis','52998224725');
 perform set_config('request.jwt.claim.sub',u2::text,true);
 caught:=false;
 begin perform public.start_app_trial(a2,'zeus','52998224725'); exception when others then if sqlerrm<>'trial_already_used' then raise; end if; caught:=true; end;
 if not caught then raise exception 'same document reused with different phone and email'; end if;
 -- Remove original auth phone, assigning it to another verified user must still be blocked.
 update auth.users set phone=null where id=u1;
 update auth.users set phone=phone1 where id=u2;
 caught:=false;
 begin perform public.start_app_trial(a2,'zeus','11144477735'); exception when others then if sqlerrm<>'trial_already_used' then raise; end if; caught:=true; end;
 if not caught then raise exception 'same phone reused'; end if;
 update auth.users set phone=phone2 where id=u2;
 update auth.users set phone=phone1 where id=u1;
 perform set_config('request.jwt.claim.sub',u1::text,true);
 update public.account_apps set current_period_end=now()-interval '1 second' where account_id=a1 and app_id='zeus';
 if private.can_access_app(a1,'zeus') then raise exception 'expired trial accepted'; end if;
 update public.account_apps set current_period_end=null where account_id=a1 and app_id='zeus';
 if private.can_access_app(a1,'zeus') then raise exception 'unlimited trial accepted'; end if;
 update public.account_apps set status='active',current_period_end=null where account_id=a1 and app_id='zeus';
 if not private.can_access_app(a1,'zeus') then raise exception 'existing paid access broken'; end if;
 caught:=false;
 begin perform public.start_app_trial(a1,'zeus','52998224725'); exception when others then if sqlerrm<>'trial_already_active' then raise; end if; caught:=true; end;
 if not caught then raise exception 'paid access overwritten'; end if;
 delete from public.accounts where id=a1;
 perform set_config('request.jwt.claim.sub',u2::text,true);
 caught:=false;
 begin perform public.start_app_trial(a2,'zeus','52998224725'); exception when others then if sqlerrm<>'trial_already_used' then raise; end if; caught:=true; end;
 if not caught then raise exception 'deletion erased trial record'; end if;
end; $$;
select 'passed: permissions, documents, verified phone, tenant ownership, 168 hours, idempotency, per-app trial, repeated document/phone, expiry, paid access, deletion retention' as result;
rollback;
