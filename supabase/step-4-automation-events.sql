-- Payscribe CRM - Step 4: Automation event log.
-- Run this after Step 1, Step 2, and Step 3.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'automation_event_status') then
    create type public.automation_event_status as enum (
      'Pending',
      'Sent',
      'Skipped',
      'Failed'
    );
  end if;
end $$;

create table if not exists public.automation_events (
  event_id uuid primary key default gen_random_uuid(),
  rule_key text not null,
  module public.crm_module not null,
  record_id text not null,
  target_user_id uuid references public.users(user_id) on delete set null,
  target_channel text,
  message text not null,
  status public.automation_event_status not null default 'Pending',
  dedupe_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_automation_events_updated_at on public.automation_events;
create trigger set_automation_events_updated_at
before update on public.automation_events
for each row execute function public.set_updated_at();

create index if not exists idx_automation_events_rule_key on public.automation_events (rule_key);
create index if not exists idx_automation_events_module on public.automation_events (module);
create index if not exists idx_automation_events_status on public.automation_events (status);
create index if not exists idx_automation_events_record_id on public.automation_events (record_id);
create index if not exists idx_automation_events_created_at on public.automation_events (created_at);

alter table public.automation_events enable row level security;

drop policy if exists "automation_events_select_super_admin" on public.automation_events;
drop policy if exists "automation_events_insert_super_admin" on public.automation_events;
drop policy if exists "automation_events_update_super_admin" on public.automation_events;
drop policy if exists "automation_events_delete_super_admin" on public.automation_events;

create policy "automation_events_select_super_admin"
on public.automation_events
for select
to authenticated
using (public.current_user_is_super_admin());

create policy "automation_events_insert_super_admin"
on public.automation_events
for insert
to authenticated
with check (public.current_user_is_super_admin());

create policy "automation_events_update_super_admin"
on public.automation_events
for update
to authenticated
using (public.current_user_is_super_admin())
with check (public.current_user_is_super_admin());

create policy "automation_events_delete_super_admin"
on public.automation_events
for delete
to authenticated
using (public.current_user_is_super_admin());
