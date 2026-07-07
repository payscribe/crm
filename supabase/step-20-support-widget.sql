-- Payscribe CRM - Step 20: Merchant support widget ticket intake.
-- Run this before enabling the embeddable support widget API.

alter table public.tickets
  add column if not exists service_id text,
  add column if not exists widget_transaction_id text,
  add column if not exists widget_session_id text,
  add column if not exists widget_attachments jsonb not null default '[]'::jsonb;

do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'tickets_source_check'
  ) then
    alter table public.tickets drop constraint tickets_source_check;
  end if;

  alter table public.tickets
    add constraint tickets_source_check
    check (source in ('Manual', 'Email', 'Widget'));

  if not exists (
    select 1 from pg_constraint where conname = 'tickets_widget_attachments_array_check'
  ) then
    alter table public.tickets
      add constraint tickets_widget_attachments_array_check
      check (jsonb_typeof(widget_attachments) = 'array');
  end if;
end $$;

create unique index if not exists idx_tickets_widget_session_id
on public.tickets (widget_session_id)
where source = 'Widget' and widget_session_id is not null;

create unique index if not exists idx_tickets_widget_transaction_per_business
on public.tickets (business_id, widget_transaction_id)
where source = 'Widget'
  and business_id is not null
  and widget_transaction_id is not null;

create index if not exists idx_tickets_service_id
on public.tickets (service_id);

create table if not exists public.support_widget_sessions (
  session_id text primary key,
  merchant_id text not null references public.businesses(business_id) on delete cascade,
  started_at timestamptz not null default now(),
  last_step_completed text not null default 'opened',
  completed boolean not null default false,
  ticket_reference text references public.tickets(ticket_id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(session_id)) > 0),
  check (length(trim(last_step_completed)) > 0),
  check (jsonb_typeof(metadata) = 'object')
);

create index if not exists idx_support_widget_sessions_merchant_started
on public.support_widget_sessions (merchant_id, started_at desc);

create index if not exists idx_support_widget_sessions_completed
on public.support_widget_sessions (completed, started_at desc);

drop trigger if exists set_support_widget_sessions_updated_at on public.support_widget_sessions;
create trigger set_support_widget_sessions_updated_at
before update on public.support_widget_sessions
for each row execute function public.set_updated_at();

alter table public.support_widget_sessions enable row level security;

drop policy if exists "support_widget_sessions_select_super_admin" on public.support_widget_sessions;
drop policy if exists "support_widget_sessions_insert_service_only" on public.support_widget_sessions;
drop policy if exists "support_widget_sessions_update_service_only" on public.support_widget_sessions;
drop policy if exists "support_widget_sessions_delete_super_admin" on public.support_widget_sessions;

create policy "support_widget_sessions_select_super_admin"
on public.support_widget_sessions
for select
to authenticated
using (public.current_user_is_super_admin());

create policy "support_widget_sessions_insert_service_only"
on public.support_widget_sessions
for insert
to authenticated
with check (false);

create policy "support_widget_sessions_update_service_only"
on public.support_widget_sessions
for update
to authenticated
using (false)
with check (false);

create policy "support_widget_sessions_delete_super_admin"
on public.support_widget_sessions
for delete
to authenticated
using (public.current_user_is_super_admin());
