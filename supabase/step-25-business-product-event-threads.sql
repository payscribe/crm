-- Payscribe CRM - Step 25: Slack thread columns for businesses and product events.
-- Run this in the Supabase SQL editor.
--
-- Businesses and product events had no Slack thread of their own, so
-- reminder/follow-up notifications for them always posted as new standalone
-- messages. This adds the same slack_channel_id/slack_thread_ts pair that
-- leads, partners, and tickets already have, so their reminders can be
-- threaded together instead.

alter table public.businesses
  add column if not exists slack_channel_id text,
  add column if not exists slack_thread_ts text;

alter table public.product_events
  add column if not exists slack_channel_id text,
  add column if not exists slack_thread_ts text;
