-- Payscribe CRM - Step 13: Slack thread tracking for partner notifications.
-- Run this in Supabase before testing partner Slack threads.

alter table public.partners
  add column if not exists slack_channel_id text,
  add column if not exists slack_thread_ts text;

create index if not exists idx_partners_slack_thread_ts
on public.partners (slack_thread_ts);
