-- Payscribe CRM - Step 19: Postmark email integration.
-- Adds support for Postmark for both inbound and outbound emails.

alter table public.outbound_email_events
  add column if not exists body_html text,
  add column if not exists postmark_message_id text;

create index if not exists idx_outbound_email_events_provider
on public.outbound_email_events (provider, status, created_at);
