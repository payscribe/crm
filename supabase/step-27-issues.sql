-- Payscribe CRM - Step 27: Issues knowledge base.
-- Run this in the Supabase SQL editor before using the Issues page.
-- Depends on: step-1 (ticket_issue_category, ticket_priority, set_updated_at),
--             step-2 (current_user_is_super_admin).

do $$
begin
  if not exists (select 1 from pg_type where typname = 'issue_status') then
    create type public.issue_status as enum ('Open', 'In Progress', 'Closed');
  end if;
end $$;

create table if not exists public.issues (
  issue_id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  category public.ticket_issue_category,
  description text not null check (length(trim(description)) > 0),
  priority public.ticket_priority not null default 'Medium',
  linked_ticket_id text references public.tickets(ticket_id) on delete set null,
  linked_business_id text references public.businesses(business_id) on delete set null,
  assigned_to uuid references public.users(user_id) on delete set null,
  status public.issue_status not null default 'Open',
  closing_notes text,
  resolved_date timestamptz,
  created_by uuid not null references public.users(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status <> 'Closed')
    or (closing_notes is not null and length(trim(closing_notes)) > 0)
  )
);

create index if not exists idx_issues_assigned_to
on public.issues (assigned_to, status);

create index if not exists idx_issues_category
on public.issues (category);

create index if not exists idx_issues_linked_ticket
on public.issues (linked_ticket_id);

create index if not exists idx_issues_linked_business
on public.issues (linked_business_id);

drop trigger if exists set_issues_updated_at on public.issues;
create trigger set_issues_updated_at
before update on public.issues
for each row execute function public.set_updated_at();

alter table public.issues enable row level security;

-- The knowledge base is readable by any authenticated staff member.
drop policy if exists "issues_select_any_authenticated" on public.issues;
create policy "issues_select_any_authenticated"
on public.issues
for select
to authenticated
using (true);

drop policy if exists "issues_insert_any_authenticated" on public.issues;
create policy "issues_insert_any_authenticated"
on public.issues
for insert
to authenticated
with check (true);

-- Updates and closing are reserved for the assignee, the creator, or an admin.
drop policy if exists "issues_update_assignee_creator_super_admin" on public.issues;
create policy "issues_update_assignee_creator_super_admin"
on public.issues
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

-- Deleting from a knowledge base is admin-only so records are never lost.
drop policy if exists "issues_delete_super_admin" on public.issues;
create policy "issues_delete_super_admin"
on public.issues
for delete
to authenticated
using (public.current_user_is_super_admin());
