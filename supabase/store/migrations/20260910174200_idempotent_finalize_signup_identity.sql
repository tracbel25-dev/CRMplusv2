create or replace function public.finalize_signup_identity(reservation_token text, target_account uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid := (select auth.uid());
  u auth.users%rowtype;
  r private.signup_identity_reservations%rowtype;
  th text; eh text;
begin
  if uid is null then raise exception 'identity_auth_required'; end if;
  if not private.is_account_owner(target_account) then raise exception 'identity_owner_required'; end if;
  select * into strict u from auth.users where id = uid;
  if nullif(u.email,'') is null or u.email_confirmed_at is null then raise exception 'identity_email_required'; end if;
  th := private.antifraud_hmac(reservation_token);
  eh := private.antifraud_hmac(lower(trim(u.email)));
  select * into r from private.signup_identity_reservations where token_hash=th and expires_at>now();
  if not found then
    if exists(select 1 from private.signup_identities where user_id=uid and account_id=target_account) then return true; end if;
    raise exception 'identity_reservation_invalid';
  end if;
  if r.email_hash <> eh then raise exception 'identity_email_mismatch'; end if;

  if exists(select 1 from private.signup_identities where document_hash=r.document_hash and user_id<>uid) then
    raise exception 'identity_document_used';
  end if;
  if exists(select 1 from private.signup_identities where user_id=uid and document_hash<>r.document_hash) then
    raise exception 'identity_user_changed';
  end if;

  insert into private.signup_identities(document_hash,user_id,account_id,email_hash,name_hash,birth_hash,verified,provider)
  values(r.document_hash,uid,target_account,r.email_hash,r.name_hash,r.birth_hash,r.verified,r.provider)
  on conflict (document_hash) do update set
    account_id=excluded.account_id,
    email_hash=excluded.email_hash,
    name_hash=excluded.name_hash,
    birth_hash=excluded.birth_hash,
    verified=excluded.verified,
    provider=excluded.provider
  where private.signup_identities.user_id=uid;
  if not found then raise exception 'identity_document_used'; end if;
  delete from private.signup_identity_reservations where token_hash=th;
  return true;
end;
$$;
revoke all on function public.finalize_signup_identity(text,uuid) from public, anon;
grant execute on function public.finalize_signup_identity(text,uuid) to authenticated;
