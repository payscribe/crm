-- Payscribe CRM - Step 21: External CRM business sync metadata.
-- Run this before using the Businesses sync modal.

alter table public.businesses
  add column if not exists external_business_id text,
  add column if not exists external_uid text,
  add column if not exists external_status text,
  add column if not exists external_last_modified timestamptz,
  add column if not exists country_code text,
  add column if not exists risk_score numeric(10, 2),
  add column if not exists risk_level text;

create unique index if not exists idx_businesses_external_business_id
on public.businesses (external_business_id)
where external_business_id is not null;

create index if not exists idx_businesses_external_uid
on public.businesses (external_uid)
where external_uid is not null;

create index if not exists idx_businesses_country_code
on public.businesses (country_code);

create table if not exists public.business_sync_runs (
  sync_id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'Running'
    check (status in ('Running', 'Completed', 'Failed')),
  filters jsonb not null default '{}'::jsonb,
  records_returned integer not null default 0,
  records_created integer not null default 0,
  records_updated integer not null default 0,
  records_skipped integer not null default 0,
  error_message text,
  created_by uuid references public.users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (records_returned >= 0),
  check (records_created >= 0),
  check (records_updated >= 0),
  check (records_skipped >= 0),
  check (jsonb_typeof(filters) = 'object')
);

create index if not exists idx_business_sync_runs_started_at
on public.business_sync_runs (started_at desc);

create index if not exists idx_business_sync_runs_status
on public.business_sync_runs (status);

drop trigger if exists set_business_sync_runs_updated_at on public.business_sync_runs;
create trigger set_business_sync_runs_updated_at
before update on public.business_sync_runs
for each row execute function public.set_updated_at();

alter table public.business_sync_runs enable row level security;

drop policy if exists "business_sync_runs_select_by_business_permission" on public.business_sync_runs;
drop policy if exists "business_sync_runs_insert_service_only" on public.business_sync_runs;
drop policy if exists "business_sync_runs_update_service_only" on public.business_sync_runs;
drop policy if exists "business_sync_runs_delete_super_admin" on public.business_sync_runs;

create policy "business_sync_runs_select_by_business_permission"
on public.business_sync_runs
for select
to authenticated
using (public.can_view_module('Businesses'));

create policy "business_sync_runs_insert_service_only"
on public.business_sync_runs
for insert
to authenticated
with check (false);

create policy "business_sync_runs_update_service_only"
on public.business_sync_runs
for update
to authenticated
using (false)
with check (false);

create policy "business_sync_runs_delete_super_admin"
on public.business_sync_runs
for delete
to authenticated
using (public.current_user_is_super_admin());
