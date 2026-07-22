-- Payscribe CRM - Step 26: Lead priority.
-- Run this in the Supabase SQL editor before using the Priority field on leads.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_priority') then
    create type public.lead_priority as enum ('Critical', 'High', 'Medium', 'Low');
  end if;
end $$;

alter table public.leads
  add column if not exists priority public.lead_priority not null default 'Medium';

create index if not exists idx_leads_priority on public.leads (priority);
