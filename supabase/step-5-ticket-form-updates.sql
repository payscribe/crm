-- Payscribe CRM - Step 5: Ticket form updates.
-- Run this in Supabase before using the updated New Ticket form.

alter type public.ticket_issue_category add value if not exists 'Complaint';
alter type public.ticket_issue_category add value if not exists 'Request';
alter type public.ticket_issue_category add value if not exists 'Inquiry';

alter table public.tickets
  add column if not exists subject text,
  add column if not exists sub_category text,
  add column if not exists interaction_mode text not null default 'Inbound',
  add column if not exists account_status text not null default 'NA';

update public.tickets
set subject = coalesce(subject, issue_category::text)
where subject is null;

alter table public.tickets
  alter column subject set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tickets_subject_not_blank'
  ) then
    alter table public.tickets
      add constraint tickets_subject_not_blank
      check (length(trim(subject)) > 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'tickets_interaction_mode_check'
  ) then
    alter table public.tickets
      add constraint tickets_interaction_mode_check
      check (interaction_mode in ('Inbound', 'Outbound'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'tickets_account_status_check'
  ) then
    alter table public.tickets
      add constraint tickets_account_status_check
      check (account_status in ('Active', 'Suspended', 'Under Review', 'NA'));
  end if;
end $$;

alter table public.tickets
  alter column assigned_to drop not null;

create or replace function public.set_ticket_sla_and_resolution()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'Closed' then
    new.priority := 'Low';
    new.assigned_to := null;
    new.sla_deadline := null;
    new.sla_breached := false;
  elsif tg_op = 'INSERT' or new.priority is distinct from old.priority or new.date_raised is distinct from old.date_raised then
    new.sla_deadline =
      case new.priority
        when 'Critical' then new.date_raised + interval '2 hours'
        when 'High' then new.date_raised + interval '4 hours'
        when 'Medium' then new.date_raised + interval '24 hours'
        when 'Low' then new.date_raised + interval '48 hours'
        else new.sla_deadline
      end;
  end if;

  if new.status in ('Resolved', 'Closed') and old.status is distinct from new.status then
    new.resolved_date := coalesce(new.resolved_date, now());
  end if;

  if new.resolved_date is not null then
    new.resolution_time_hours := round(
      (extract(epoch from (new.resolved_date - new.date_raised)) / 3600)::numeric,
      2
    );
  end if;

  if new.sla_deadline is not null and new.status not in ('Resolved', 'Closed') and now() > new.sla_deadline then
    new.sla_breached := true;
  else
    new.sla_breached := false;
  end if;

  return new;
end;
$$;

create index if not exists idx_tickets_subject on public.tickets (subject);
create index if not exists idx_tickets_sub_category on public.tickets (sub_category);
create index if not exists idx_tickets_interaction_mode on public.tickets (interaction_mode);
create index if not exists idx_tickets_account_status on public.tickets (account_status);
