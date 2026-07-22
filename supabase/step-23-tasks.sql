-- Payscribe CRM - Step 23: Personal tasks and reminders.
-- Run this in the Supabase SQL editor after step-22-activity-log.sql (reuses crm_record_type).
-- Run this before using the "My Tasks" page.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'task_status') then
    create type public.task_status as enum ('Open', 'Done', 'Cancelled');
  end if;
end $$;

-- Adding an enum value is a lightweight, non-destructive operation (unlike
-- removing one), so extending crm_module here is safe. This lets task due
-- reminders be logged in automation_events with module = 'Tasks'.
alter type public.crm_module add value if not exists 'Tasks';

create table if not exists public.tasks (
  task_id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  notes text,
  entity_type public.crm_record_type,
  entity_id text,
  assigned_to uuid not null references public.users(user_id) on delete cascade,
  due_date date not null,
  status public.task_status not null default 'Open',
  completed_at timestamptz,
  created_by uuid not null references public.users(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (entity_type is null and entity_id is null)
    or (entity_type is not null and entity_id is not null)
  )
);

create index if not exists idx_tasks_assigned_to
on public.tasks (assigned_to, status, due_date);

create index if not exists idx_tasks_entity
on public.tasks (entity_type, entity_id);

drop trigger if exists set_tasks_updated_at on public.tasks;
create trigger set_tasks_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

alter table public.tasks enable row level security;

drop policy if exists "tasks_select_own_or_super_admin" on public.tasks;
drop policy if exists "tasks_insert_own" on public.tasks;
drop policy if exists "tasks_update_own_or_super_admin" on public.tasks;
drop policy if exists "tasks_delete_own_or_super_admin" on public.tasks;

create policy "tasks_select_own_or_super_admin"
on public.tasks
for select
to authenticated
using (
  assigned_to = auth.uid()
  or created_by = auth.uid()
  or public.current_user_is_super_admin()
);

create policy "tasks_insert_own"
on public.tasks
for insert
to authenticated
with check (created_by = auth.uid());

create policy "tasks_update_own_or_super_admin"
on public.tasks
for update
to authenticated
using (
  assigned_to = auth.uid()
  or created_by = auth.uid()
  or public.current_user_is_super_admin()
)
with check (
  assigned_to = auth.uid()
  or created_by = auth.uid()
  or public.current_user_is_super_admin()
);

create policy "tasks_delete_own_or_super_admin"
on public.tasks
for delete
to authenticated
using (
  created_by = auth.uid()
  or public.current_user_is_super_admin()
);
