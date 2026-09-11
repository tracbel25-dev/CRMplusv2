begin;

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
  v_company_document text;
  v_company_hash text;
  v_owner_hash text;
  v_existing private.trial_identity_claims%rowtype;
begin
  if target_app not in ('zeus','artemis') then return false; end if;
  if claim_source not in ('direct','mercadopago') then return false; end if;

  select a.cnpj into v_company_document
  from public.accounts a
  where a.id = target_account and a.status = 'active';
  if v_company_document is null or not public.valid_cnpj(v_company_document) then return false; end if;

  if not exists (
    select 1 from public.account_members m
    where m.account_id=target_account and m.user_id=target_user
      and m.role='owner' and m.status='active'
  ) then return false; end if;

  select i.document_hash into v_owner_hash
  from private.signup_identities i
  where i.account_id=target_account and i.user_id=target_user
  limit 1;
  if v_owner_hash is null then return false; end if;

  v_company_hash := private.antifraud_hmac(v_company_document);
  perform pg_advisory_xact_lock(hashtextextended('trial-company:'||target_app||':'||v_company_hash,0));
  perform pg_advisory_xact_lock(hashtextextended('trial-owner:'||target_app||':'||v_owner_hash,0));
  perform pg_advisory_xact_lock(hashtextextended('trial-user:'||target_app||':'||target_user::text,0));

  select * into v_existing
  from private.trial_identity_claims c
  where c.app_id=target_app
    and (c.company_hash=v_company_hash or c.owner_document_hash=v_owner_hash or c.user_id=target_user)
  limit 1;

  if found then
    return v_existing.account_id=target_account and v_existing.user_id=target_user;
  end if;

  begin
    insert into private.trial_identity_claims(
      app_id,company_hash,owner_document_hash,account_id,user_id,source,source_id
    ) values(
      target_app,v_company_hash,v_owner_hash,target_account,target_user,claim_source,claim_source_id
    );
  exception when unique_violation then
    return false;
  end;
  return true;
end;
$$;

revoke all on function private.claim_trial_identity(uuid,text,uuid,text,uuid) from public, anon, authenticated;
grant execute on function private.claim_trial_identity(uuid,text,uuid,text,uuid) to service_role;

create or replace function public.mp_trial_eligible(target_account uuid, target_app text, target_user uuid)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_company_document text;
  v_company_hash text;
  v_owner_hash text;
begin
  select a.cnpj into v_company_document
  from public.accounts a
  where a.id=target_account and a.status='active';
  if v_company_document is null or not public.valid_cnpj(v_company_document) then return false; end if;

  select i.document_hash into v_owner_hash
  from private.signup_identities i
  where i.account_id=target_account and i.user_id=target_user
  limit 1;
  if v_owner_hash is null then return false; end if;
  v_company_hash := private.antifraud_hmac(v_company_document);

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
        and (c.company_hash=v_company_hash or c.owner_document_hash=v_owner_hash or c.user_id=target_user)
    );
end;
$$;

revoke all on function public.mp_trial_eligible(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.mp_trial_eligible(uuid,text,uuid) to service_role;

commit;
