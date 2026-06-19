-- Payscribe CRM - Step 6: Require resolution notes for closed tickets.
-- Run this in Supabase after step-5-ticket-form-updates.sql.

alter table public.tickets
  drop constraint if exists tickets_closed_requires_resolution;

alter table public.tickets
  add constraint tickets_closed_requires_resolution
  check (
    status <> 'Closed'
    or (
      resolution_notes is not null
      and length(trim(resolution_notes)) > 0
    )
  )
  not valid;
