-- Payscribe CRM - Step 12: Slack thread tracking for lead notifications.
-- Run this in Supabase before testing lead Slack threads.

alter table public.leads
  add column if not exists slack_channel_id text,
  add column if not exists slack_thread_ts text;

create index if not exists idx_leads_slack_thread_ts
on public.leads (slack_thread_ts);
