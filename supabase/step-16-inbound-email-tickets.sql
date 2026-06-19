-- Payscribe CRM - Step 16: Inbound email ticket ingestion.
-- Run this before testing Google Apps Script inbound ticket creation.

alter table public.tickets
  alter column business_id drop not null;

alter table public.tickets
  add column if not exists source text not null default 'Manual',
  add column if not exists customer_email text,
  add column if not exists customer_name text,
  add column if not exists inbound_email_body text,
  add column if not exists inbound_email_message_id text,
  add column if not exists inbound_email_thread_id text,
  add column if not exists customer_notified_at timestamptz,
  add column if not exists closure_notified_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tickets_source_check'
  ) then
    alter table public.tickets
      add constraint tickets_source_check
      check (source in ('Manual', 'Email'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'tickets_customer_email_check'
  ) then
    alter table public.tickets
      add constraint tickets_customer_email_check
      check (customer_email is null or position('@' in customer_email) > 1);
  end if;
end $$;

create unique index if not exists idx_tickets_inbound_email_message_id
on public.tickets (inbound_email_message_id)
where inbound_email_message_id is not null;

create index if not exists idx_tickets_source
on public.tickets (source);

create index if not exists idx_tickets_customer_email
on public.tickets (customer_email);

create index if not exists idx_tickets_unmatched_email
on public.tickets (date_raised desc)
where source = 'Email' and business_id is null;

create table if not exists public.inbound_email_events (
  event_id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_message_id text not null unique,
  provider_thread_id text,
  sender_email text not null check (position('@' in sender_email) > 1),
  sender_name text,
  subject text not null,
  body_text text not null,
  received_at timestamptz not null,
  raw_payload jsonb not null,
  processing_status text not null default 'Pending'
    check (processing_status in ('Pending', 'Processing', 'Processed', 'ProcessedWithEmailError', 'Failed')),
  ticket_id text references public.tickets(ticket_id) on delete set null,
  matched_business_id text references public.businesses(business_id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_inbound_email_events_status
on public.inbound_email_events (processing_status);

create index if not exists idx_inbound_email_events_received_at
on public.inbound_email_events (received_at desc);

drop trigger if exists set_inbound_email_events_updated_at on public.inbound_email_events;
create trigger set_inbound_email_events_updated_at
before update on public.inbound_email_events
for each row execute function public.set_updated_at();

alter table public.inbound_email_events enable row level security;

drop policy if exists "inbound_email_events_select_by_ticket_permission" on public.inbound_email_events;
drop policy if exists "inbound_email_events_insert_service_only" on public.inbound_email_events;
drop policy if exists "inbound_email_events_update_service_only" on public.inbound_email_events;
drop policy if exists "inbound_email_events_delete_super_admin" on public.inbound_email_events;

create policy "inbound_email_events_select_by_ticket_permission"
on public.inbound_email_events
for select
to authenticated
using (public.can_view_module('Tickets'));

create policy "inbound_email_events_insert_service_only"
on public.inbound_email_events
for insert
to authenticated
with check (false);

create policy "inbound_email_events_update_service_only"
on public.inbound_email_events
for update
to authenticated
using (false)
with check (false);

create policy "inbound_email_events_delete_super_admin"
on public.inbound_email_events
for delete
to authenticated
using (public.current_user_is_super_admin());

create or replace function public.prevent_closed_ticket_updates()
returns trigger
language plpgsql
as $$
declare
  old_without_notification_fields jsonb;
  new_without_notification_fields jsonb;
begin
  old_without_notification_fields :=
    to_jsonb(old)
    - 'customer_notified_at'
    - 'closure_notified_at'
    - 'updated_at';

  new_without_notification_fields :=
    to_jsonb(new)
    - 'customer_notified_at'
    - 'closure_notified_at'
    - 'updated_at';

  if old.status = 'Closed'
    and new_without_notification_fields is distinct from old_without_notification_fields then
    raise exception 'Closed tickets cannot be edited or updated';
  end if;

  return new;
end;
$$;
