-- Follow-up dates are optional. Closed leads (won, lost or converted) never
-- need one, and active leads may be saved without one.
alter table public.leads
  alter column next_followup_date drop not null;
