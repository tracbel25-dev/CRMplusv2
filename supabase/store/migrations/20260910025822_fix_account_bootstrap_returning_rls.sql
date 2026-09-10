create or replace function public.create_account(account_name text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  new_account_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication_required';
  end if;

  select m.account_id into new_account_id
  from public.account_members m
  where m.user_id = current_user_id and m.status = 'active'
  order by m.created_at
  limit 1;

  if new_account_id is not null then
    return new_account_id;
  end if;

  if account_name is null or char_length(trim(account_name)) < 2 then
    raise exception 'invalid_account_name';
  end if;

  -- Generate the id before INSERT. Using INSERT ... RETURNING id here makes
  -- Postgres evaluate the SELECT RLS policy before the owner's membership
  -- exists, so the bootstrap fails even though the INSERT policy itself passes.
  new_account_id := gen_random_uuid();

  insert into public.accounts(id, name, status)
  values (new_account_id, trim(account_name), 'active');

  insert into public.account_members(account_id, user_id, role, status)
  values (new_account_id, current_user_id, 'owner', 'active');

  return new_account_id;
end;
$$;
