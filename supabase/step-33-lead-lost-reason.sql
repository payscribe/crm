-- Payscribe CRM - Step 33: Lead closed-lost reason.
-- Run this in Supabase before using the updated Closed Lost lead flow.

alter table public.leads
  add column if not exists lost_reason text;

create index if not exists idx_leads_lost_reason
on public.leads (lost_reason)
where lost_reason is not null;
