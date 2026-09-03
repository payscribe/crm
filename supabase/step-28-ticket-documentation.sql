-- Payscribe CRM - Step 28: Replace the duplicate Issues workflow with
-- documentation attached directly to tickets.
-- Run after step-27. Linked issue content is preserved before `issues` is removed.

create table if not exists public.ticket_documentation (
  documentation_id uuid primary key default gen_random_uuid(),
  ticket_id text not null unique references public.tickets(ticket_id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  content_html text not null check (length(trim(content_html)) > 0),
  created_by uuid references public.users(user_id) on delete set null,
  updated_by uuid references public.users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ticket_documentation_updated
on public.ticket_documentation (updated_at desc);

drop trigger if exists set_ticket_documentation_updated_at on public.ticket_documentation;
create trigger set_ticket_documentation_updated_at
before update on public.ticket_documentation
for each row execute function public.set_updated_at();

-- Preserve the newest linked issue for each ticket as its initial documentation.
insert into public.ticket_documentation (
  ticket_id,
  title,
  content_html,
  created_by,
  updated_by,
  created_at,
  updated_at
)
select distinct on (linked_ticket_id)
  linked_ticket_id,
  title,
  '<p>' ||
    replace(replace(replace(coalesce(closing_notes, description), '&', '&amp;'), '<', '&lt;'), '>', '&gt;') ||
  '</p>',
  created_by,
  created_by,
  created_at,
  updated_at
from public.issues
where linked_ticket_id is not null
  and length(trim(coalesce(closing_notes, description))) > 0
order by linked_ticket_id, updated_at desc
on conflict (ticket_id) do nothing;

alter table public.ticket_documentation enable row level security;

drop policy if exists "ticket_documentation_select" on public.ticket_documentation;
create policy "ticket_documentation_select"
on public.ticket_documentation for select to authenticated
using (public.can_view_module('Tickets'));

drop policy if exists "ticket_documentation_insert" on public.ticket_documentation;
create policy "ticket_documentation_insert"
on public.ticket_documentation for insert to authenticated
with check (public.can_edit_module('Tickets'));

drop policy if exists "ticket_documentation_update" on public.ticket_documentation;
create policy "ticket_documentation_update"
on public.ticket_documentation for update to authenticated
using (public.can_edit_module('Tickets'))
with check (public.can_edit_module('Tickets'));

drop policy if exists "ticket_documentation_delete" on public.ticket_documentation;
create policy "ticket_documentation_delete"
on public.ticket_documentation for delete to authenticated
using (public.current_user_is_super_admin());

drop table if exists public.issues;
drop type if exists public.issue_status;
