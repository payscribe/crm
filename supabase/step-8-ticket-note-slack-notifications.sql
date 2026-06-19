-- Payscribe CRM - Step 8: Ticket note Slack notification support.
-- Run this in Supabase after step-7-ticket-note-trail.sql.

alter table public.tickets
  add column if not exists created_by uuid references public.users(user_id) on delete set null;

create index if not exists idx_tickets_created_by
on public.tickets (created_by);
