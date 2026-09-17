alter table public.accounts add column if not exists person_type text;

update public.accounts
set person_type = case
  when cnpj is not null and public.valid_cnpj(cnpj) then 'pj'
  else 'pf'
end
where person_type is null;

alter table public.accounts alter column person_type set default 'pf';
alter table public.accounts alter column person_type set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='accounts_person_type_check') then
    alter table public.accounts
      add constraint accounts_person_type_check
      check (person_type in ('pf','pj'));
  end if;

  if not exists (select 1 from pg_constraint where conname='accounts_person_type_document_check') then
    alter table public.accounts
      add constraint accounts_person_type_document_check
      check (
        (person_type='pf' and cnpj is null) or
        (person_type='pj' and cnpj is not null and public.valid_cnpj(cnpj))
      );
  end if;
end $$;

create unique index if not exists accounts_cnpj_normalized_unique
on public.accounts ((regexp_replace(cnpj,'[^0-9]','','g')))
where cnpj is not null;

create or replace function public.create_account(
  account_name text,
  account_person_type text,
  account_cnpj text default null
)
returns uuid
language plpgsql
set search_path=''
as $$
declare
  current_user_id uuid := (select auth.uid());
  new_account_id uuid;
  ptype text := lower(trim(coalesce(account_person_type,'')));
  normalized_cnpj text := regexp_replace(coalesce(account_cnpj,''),'[^0-9]','','g');
begin
  if current_user_id is null then raise exception 'authentication_required'; end if;
  if account_name is null or char_length(trim(account_name)) < 2 then raise exception 'invalid_account_name'; end if;
  if ptype not in ('pf','pj') then raise exception 'invalid_person_type'; end if;

  if ptype='pj' then
    if not public.valid_cnpj(normalized_cnpj) then raise exception 'invalid_cnpj'; end if;
    if exists(
      select 1 from public.accounts a
      where a.cnpj is not null
        and regexp_replace(a.cnpj,'[^0-9]','','g')=normalized_cnpj
    ) then
      raise exception 'cnpj_already_used';
    end if;
  else
    normalized_cnpj := null;
  end if;

  select m.account_id into new_account_id
  from public.account_members m
  where m.user_id=current_user_id and m.status='active'
  order by m.created_at
  limit 1;

  if new_account_id is not null then
    if not exists(
      select 1 from public.account_members m
      where m.account_id=new_account_id
        and m.user_id=current_user_id
        and m.role='owner'
        and m.status='active'
    ) then
      return new_account_id;
    end if;

    if ptype='pj' and exists(
      select 1 from public.accounts a
      where a.id<>new_account_id
        and a.cnpj is not null
        and regexp_replace(a.cnpj,'[^0-9]','','g')=normalized_cnpj
    ) then
      raise exception 'cnpj_already_used';
    end if;

    update public.accounts
    set name=trim(account_name),
        person_type=ptype,
        cnpj=normalized_cnpj,
        updated_at=now()
    where id=new_account_id;

    return new_account_id;
  end if;

  new_account_id := gen_random_uuid();

  insert into public.accounts(id,name,status,person_type,cnpj)
  values(new_account_id,trim(account_name),'active',ptype,normalized_cnpj);

  insert into public.account_members(account_id,user_id,role,status)
  values(new_account_id,current_user_id,'owner','active');

  return new_account_id;
exception when unique_violation then
  raise exception 'cnpj_already_used';
end;
$$;

create or replace function public.create_account(account_name text)
returns uuid
language sql
set search_path=''
as $$
  select public.create_account(account_name,'pf',null);
$$;

revoke all on function public.create_account(text,text,text) from public, anon;
grant execute on function public.create_account(text,text,text) to authenticated;
revoke all on function public.create_account(text) from public, anon;
grant execute on function public.create_account(text) to authenticated;
