-- Payscribe CRM - Step 35: Gmail history sync for leads.
-- A Google Apps Script on the shared sales mailbox logs emails sent to or
-- received from a lead's address into lead_communication_log.

alter table public.lead_communication_log
  add column if not exists source text not null default 'Manual',
  add column if not exists email_message_id text,
  add column if not exists gmail_message_id text,
  add column if not exists gmail_thread_id text,
  add column if not exists email_subject text,
  add column if not exists email_from text,
  add column if not exists email_to text;

alter table public.lead_communication_log
  drop constraint if exists lead_communication_log_source_check;

alter table public.lead_communication_log
  add constraint lead_communication_log_source_check
  check (source in ('Manual', 'Gmail'));

-- Synced emails have no staff author; manual entries still require one.
alter table public.lead_communication_log
  alter column logged_by drop not null;

alter table public.lead_communication_log
  drop constraint if exists lead_communication_log_logged_by_check;

alter table public.lead_communication_log
  add constraint lead_communication_log_logged_by_check
  check (source = 'Gmail' or logged_by is not null);

-- One row per email per lead. Manual rows have a null message ID and never conflict.
create unique index if not exists idx_lead_communication_log_email_message
on public.lead_communication_log (lead_id, email_message_id);

-- The address whose Gmail history has been imported. When a lead's email is
-- added or changed, the two differ and the script imports past emails.
alter table public.leads
  add column if not exists email_history_synced_for text;

-- History imports arrive out of order, so never move last contact backwards.
create or replace function public.sync_lead_after_communication_log()
returns trigger
language plpgsql
as $$
begin
  update public.leads
  set
    last_contact_date = greatest(coalesce(last_contact_date, new.date::date), new.date::date),
    next_followup_date = coalesce(new.follow_up_date, next_followup_date),
    updated_at = now()
  where lead_id = new.lead_id;

  return new;
end;
$$;
