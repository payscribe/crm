-- Payscribe CRM - Step 10: Slack thread tracking for ticket notifications.
-- Run this in Supabase before testing ticket Slack threads.

alter table public.tickets
  add column if not exists slack_channel_id text,
  add column if not exists slack_thread_ts text;

create index if not exists idx_tickets_slack_thread_ts
on public.tickets (slack_thread_ts);
