-- Payscribe CRM - Step 22: Unified activity log.
-- Run this in the Supabase SQL editor before using the activity timeline on entity detail pages.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'crm_record_type') then
    create type public.crm_record_type as enum (
      'Business',
      'Lead',
      'Partner',
      'Ticket',
      'Product Event'
    );
  end if;
end $$;

create table if not exists public.activity_log (
  activity_id uuid primary key default gen_random_uuid(),
  entity_type public.crm_record_type not null,
  entity_id text not null,
  summary text not null check (length(trim(summary)) > 0),
  channel text,
  direction public.communication_direction,
  created_by uuid not null references public.users(user_id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists idx_activity_log_entity
on public.activity_log (entity_type, entity_id, created_at desc);

create index if not exists idx_activity_log_created_by
on public.activity_log (created_by);

alter table public.activity_log enable row level security;

create or replace function public.can_view_activity(requested_entity_type public.crm_record_type)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case requested_entity_type
    when 'Business' then public.can_view_module('Businesses')
    when 'Lead' then public.can_view_module('Leads')
    when 'Partner' then public.can_view_module('Partners')
    when 'Ticket' then public.can_view_module('Tickets')
    when 'Product Event' then public.can_view_module('Product Log')
  end;
$$;

create or replace function public.can_create_activity(requested_entity_type public.crm_record_type)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case requested_entity_type
    when 'Business' then public.can_create_module('Businesses')
    when 'Lead' then public.can_create_module('Leads')
    when 'Partner' then public.can_create_module('Partners')
    when 'Ticket' then public.can_create_module('Tickets')
    when 'Product Event' then public.can_create_module('Product Log')
  end;
$$;

create or replace function public.can_delete_activity(requested_entity_type public.crm_record_type)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case requested_entity_type
    when 'Business' then public.can_delete_module('Businesses')
    when 'Lead' then public.can_delete_module('Leads')
    when 'Partner' then public.can_delete_module('Partners')
    when 'Ticket' then public.can_delete_module('Tickets')
    when 'Product Event' then public.can_delete_module('Product Log')
  end;
$$;

drop policy if exists "activity_log_select_by_permission" on public.activity_log;
drop policy if exists "activity_log_insert_by_permission" on public.activity_log;
drop policy if exists "activity_log_update_blocked" on public.activity_log;
drop policy if exists "activity_log_delete_by_permission" on public.activity_log;

create policy "activity_log_select_by_permission"
on public.activity_log
for select
to authenticated
using (public.can_view_activity(entity_type));

create policy "activity_log_insert_by_permission"
on public.activity_log
for insert
to authenticated
with check (public.can_create_activity(entity_type));

create policy "activity_log_update_blocked"
on public.activity_log
for update
to authenticated
using (false)
with check (false);

create policy "activity_log_delete_by_permission"
on public.activity_log
for delete
to authenticated
using (public.can_delete_activity(entity_type));
