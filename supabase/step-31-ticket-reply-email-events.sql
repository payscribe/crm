-- Payscribe CRM - Step 31: Per-message customer reply emails.
-- Each CRM reply gets a distinct, retryable outbound email event.

alter table public.outbound_email_events
  add column if not exists source_id text;

alter table public.outbound_email_events
  drop constraint if exists outbound_email_events_notification_type_check;

alter table public.outbound_email_events
  add constraint outbound_email_events_notification_type_check
  check (notification_type in ('Ticket Opened', 'Ticket Closed', 'Ticket Reply'));

drop index if exists public.idx_outbound_email_events_ticket_notification;

create unique index if not exists idx_outbound_email_events_ticket_lifecycle
on public.outbound_email_events (ticket_id, notification_type)
where source_id is null;

create unique index if not exists idx_outbound_email_events_ticket_reply
on public.outbound_email_events (ticket_id, notification_type, source_id)
where source_id is not null;

create index if not exists idx_outbound_email_events_source_id
on public.outbound_email_events (source_id);
