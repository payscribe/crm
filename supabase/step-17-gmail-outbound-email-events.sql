-- Payscribe CRM - Step 17: Gmail outbound reply queue.
-- Run this before testing ticket closure replies through Google Apps Script.

create table if not exists public.outbound_email_events (
  event_id uuid primary key default gen_random_uuid(),
  provider text not null default 'google_apps_script',
  ticket_id text not null references public.tickets(ticket_id) on delete cascade,
  recipient_email text not null check (position('@' in recipient_email) > 1),
  recipient_name text,
  gmail_thread_id text not null,
  subject text not null,
  body_text text not null,
  status text not null default 'Pending'
    check (status in ('Pending', 'Sent', 'Failed')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_outbound_email_events_status
on public.outbound_email_events (status, created_at);

create index if not exists idx_outbound_email_events_ticket_id
on public.outbound_email_events (ticket_id);

create unique index if not exists idx_outbound_email_events_ticket_closure
on public.outbound_email_events (ticket_id)
where subject like 'Ticket closed:%';

drop trigger if exists set_outbound_email_events_updated_at on public.outbound_email_events;
create trigger set_outbound_email_events_updated_at
before update on public.outbound_email_events
for each row execute function public.set_updated_at();

alter table public.outbound_email_events enable row level security;

drop policy if exists "outbound_email_events_select_by_ticket_permission" on public.outbound_email_events;
drop policy if exists "outbound_email_events_insert_service_only" on public.outbound_email_events;
drop policy if exists "outbound_email_events_update_service_only" on public.outbound_email_events;
drop policy if exists "outbound_email_events_delete_super_admin" on public.outbound_email_events;

create policy "outbound_email_events_select_by_ticket_permission"
on public.outbound_email_events
for select
to authenticated
using (public.can_view_module('Tickets'));

create policy "outbound_email_events_insert_service_only"
on public.outbound_email_events
for insert
to authenticated
with check (false);

create policy "outbound_email_events_update_service_only"
on public.outbound_email_events
for update
to authenticated
using (false)
with check (false);

create policy "outbound_email_events_delete_super_admin"
on public.outbound_email_events
for delete
to authenticated
using (public.current_user_is_super_admin());
