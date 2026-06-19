-- Payscribe CRM - Step 18: Queue-first customer ticket emails.
-- Run this after Step 17. It lets the same outbound queue handle both
-- ticket-opened acknowledgements and ticket-closed resolution emails.

alter table public.outbound_email_events
  add column if not exists notification_type text not null default 'Ticket Closed';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'outbound_email_events_notification_type_check'
  ) then
    alter table public.outbound_email_events
      add constraint outbound_email_events_notification_type_check
      check (notification_type in ('Ticket Opened', 'Ticket Closed'));
  end if;
end $$;

drop index if exists public.idx_outbound_email_events_ticket_closure;

create unique index if not exists idx_outbound_email_events_ticket_notification
on public.outbound_email_events (ticket_id, notification_type);

create index if not exists idx_outbound_email_events_notification_type
on public.outbound_email_events (notification_type);
