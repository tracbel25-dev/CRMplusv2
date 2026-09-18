create or replace function public.current_identity_summary()
returns jsonb
language sql
security definer
set search_path = pg_catalog, public, private
as $$
  select jsonb_build_object(
    'registered', i.user_id is not null,
    'verified', coalesce(i.verified, false),
    'provider', i.provider
  )
  from (select auth.uid() as uid) u
  left join private.signup_identities i on i.user_id = u.uid
  limit 1;
$$;

revoke all on function public.current_identity_summary() from public, anon;
grant execute on function public.current_identity_summary() to authenticated;
