create table if not exists public.trial_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  app_id text not null references public.apps(id) on delete cascade,
  plan_id uuid references public.plans(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'requested'
    check (status in ('requested','validating','validation_pending','activated','blocked')),
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_at timestamptz
);

create index if not exists trial_requests_account_created_idx
  on public.trial_requests(account_id, requested_at desc);

create index if not exists trial_requests_open_idx
  on public.trial_requests(account_id, app_id, requested_at desc)
  where status in ('requested','validating','validation_pending');

alter table public.trial_requests enable row level security;

revoke all on table public.trial_requests from anon, authenticated;
grant select, insert, update, delete on table public.trial_requests to service_role;
