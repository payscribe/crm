-- Payscribe CRM - Step 7: Ticket note trail and closed-ticket lock.
-- Run this in Supabase after step-6-ticket-resolution-required.sql.

create table if not exists public.ticket_notes (
  note_id uuid primary key default gen_random_uuid(),
  ticket_id text not null references public.tickets(ticket_id) on delete cascade,
  note_body text not null check (length(trim(note_body)) > 0),
  created_by uuid not null references public.users(user_id),
  created_at timestamptz not null default now()
);

create index if not exists idx_ticket_notes_ticket_id
on public.ticket_notes (ticket_id);

create index if not exists idx_ticket_notes_created_by
on public.ticket_notes (created_by);

create index if not exists idx_ticket_notes_created_at
on public.ticket_notes (created_at desc);

alter table public.ticket_notes enable row level security;

drop policy if exists "ticket_notes_select_by_permission" on public.ticket_notes;
drop policy if exists "ticket_notes_insert_by_permission" on public.ticket_notes;
drop policy if exists "ticket_notes_update_blocked" on public.ticket_notes;
drop policy if exists "ticket_notes_delete_by_permission" on public.ticket_notes;

create policy "ticket_notes_select_by_permission"
on public.ticket_notes
for select
to authenticated
using (public.can_view_module('Tickets'));

create policy "ticket_notes_insert_by_permission"
on public.ticket_notes
for insert
to authenticated
with check (public.can_edit_module('Tickets'));

create policy "ticket_notes_update_blocked"
on public.ticket_notes
for update
to authenticated
using (false)
with check (false);

create policy "ticket_notes_delete_by_permission"
on public.ticket_notes
for delete
to authenticated
using (public.can_delete_module('Tickets'));

create or replace function public.prevent_closed_ticket_updates()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'Closed' and new is distinct from old then
    raise exception 'Closed tickets cannot be edited or updated';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_closed_ticket_updates_before_update on public.tickets;
create trigger prevent_closed_ticket_updates_before_update
before update on public.tickets
for each row execute function public.prevent_closed_ticket_updates();
