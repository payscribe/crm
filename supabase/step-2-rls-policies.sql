-- Payscribe CRM - Step 2: Row Level Security helper functions and policies.
-- Run this only after Step 1 has completed successfully.
-- These policies enforce database-level access independently of the frontend.

create or replace function public.current_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.user_id = auth.uid()
      and u.status = 'Active'
  );
$$;

create or replace function public.current_user_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.user_id = auth.uid()
      and u.status = 'Active'
      and u.is_super_admin = true
  );
$$;

create or replace function public.current_user_has_permission(
  requested_module public.crm_module,
  requested_action text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_is_super_admin()
    or exists (
      select 1
      from public.users u
      join public.permissions p on p.user_id = u.user_id
      where u.user_id = auth.uid()
        and u.status = 'Active'
        and p.module = requested_module
        and case requested_action
          when 'view' then p.can_view
          when 'create' then p.can_create
          when 'edit' then p.can_edit
          when 'delete' then p.can_delete
          when 'assign' then p.can_assign
          else false
        end
    );
$$;

create or replace function public.can_view_module(requested_module public.crm_module)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_has_permission(requested_module, 'view');
$$;

create or replace function public.can_create_module(requested_module public.crm_module)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_has_permission(requested_module, 'create');
$$;

create or replace function public.can_edit_module(requested_module public.crm_module)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_has_permission(requested_module, 'edit');
$$;

create or replace function public.can_delete_module(requested_module public.crm_module)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_has_permission(requested_module, 'delete');
$$;

alter table public.users enable row level security;
alter table public.permissions enable row level security;
alter table public.permission_templates enable row level security;
alter table public.leads enable row level security;
alter table public.lead_communication_log enable row level security;
alter table public.businesses enable row level security;
alter table public.tickets enable row level security;
alter table public.product_events enable row level security;
alter table public.referrals enable row level security;
alter table public.partners enable row level security;
alter table public.partner_communication_log enable row level security;

drop policy if exists "users_select_own_or_super_admin" on public.users;
drop policy if exists "users_insert_super_admin" on public.users;
drop policy if exists "users_update_super_admin" on public.users;
drop policy if exists "users_delete_super_admin" on public.users;

create policy "users_select_own_or_super_admin"
on public.users
for select
to authenticated
using (
  (user_id = auth.uid() and status = 'Active')
  or public.current_user_is_super_admin()
);

create policy "users_insert_super_admin"
on public.users
for insert
to authenticated
with check (public.current_user_is_super_admin());

create policy "users_update_super_admin"
on public.users
for update
to authenticated
using (public.current_user_is_super_admin())
with check (public.current_user_is_super_admin());

create policy "users_delete_super_admin"
on public.users
for delete
to authenticated
using (public.current_user_is_super_admin());

drop policy if exists "permissions_select_own_or_super_admin" on public.permissions;
drop policy if exists "permissions_insert_super_admin" on public.permissions;
drop policy if exists "permissions_update_super_admin" on public.permissions;
drop policy if exists "permissions_delete_super_admin" on public.permissions;

create policy "permissions_select_own_or_super_admin"
on public.permissions
for select
to authenticated
using (
  (user_id = auth.uid() and public.current_user_is_active())
  or public.current_user_is_super_admin()
);

create policy "permissions_insert_super_admin"
on public.permissions
for insert
to authenticated
with check (public.current_user_is_super_admin());

create policy "permissions_update_super_admin"
on public.permissions
for update
to authenticated
using (public.current_user_is_super_admin())
with check (public.current_user_is_super_admin());

create policy "permissions_delete_super_admin"
on public.permissions
for delete
to authenticated
using (public.current_user_is_super_admin());

drop policy if exists "permission_templates_select_super_admin" on public.permission_templates;
drop policy if exists "permission_templates_insert_super_admin" on public.permission_templates;
drop policy if exists "permission_templates_update_super_admin" on public.permission_templates;
drop policy if exists "permission_templates_delete_super_admin" on public.permission_templates;

create policy "permission_templates_select_super_admin"
on public.permission_templates
for select
to authenticated
using (public.current_user_is_super_admin());

create policy "permission_templates_insert_super_admin"
on public.permission_templates
for insert
to authenticated
with check (public.current_user_is_super_admin());

create policy "permission_templates_update_super_admin"
on public.permission_templates
for update
to authenticated
using (public.current_user_is_super_admin())
with check (public.current_user_is_super_admin());

create policy "permission_templates_delete_super_admin"
on public.permission_templates
for delete
to authenticated
using (public.current_user_is_super_admin());

drop policy if exists "leads_select_by_permission" on public.leads;
drop policy if exists "leads_insert_by_permission" on public.leads;
drop policy if exists "leads_update_by_permission" on public.leads;
drop policy if exists "leads_delete_by_permission" on public.leads;

create policy "leads_select_by_permission"
on public.leads
for select
to authenticated
using (public.can_view_module('Leads'));

create policy "leads_insert_by_permission"
on public.leads
for insert
to authenticated
with check (public.can_create_module('Leads'));

create policy "leads_update_by_permission"
on public.leads
for update
to authenticated
using (public.can_edit_module('Leads'))
with check (public.can_edit_module('Leads'));

create policy "leads_delete_by_permission"
on public.leads
for delete
to authenticated
using (public.can_delete_module('Leads'));

drop policy if exists "lead_communication_log_select_by_permission" on public.lead_communication_log;
drop policy if exists "lead_communication_log_insert_by_permission" on public.lead_communication_log;
drop policy if exists "lead_communication_log_update_by_permission" on public.lead_communication_log;
drop policy if exists "lead_communication_log_delete_by_permission" on public.lead_communication_log;

create policy "lead_communication_log_select_by_permission"
on public.lead_communication_log
for select
to authenticated
using (public.can_view_module('Leads'));

create policy "lead_communication_log_insert_by_permission"
on public.lead_communication_log
for insert
to authenticated
with check (public.can_create_module('Leads'));

create policy "lead_communication_log_update_by_permission"
on public.lead_communication_log
for update
to authenticated
using (public.can_edit_module('Leads'))
with check (public.can_edit_module('Leads'));

create policy "lead_communication_log_delete_by_permission"
on public.lead_communication_log
for delete
to authenticated
using (public.can_delete_module('Leads'));

drop policy if exists "businesses_select_by_permission" on public.businesses;
drop policy if exists "businesses_insert_by_permission" on public.businesses;
drop policy if exists "businesses_update_by_permission" on public.businesses;
drop policy if exists "businesses_delete_by_permission" on public.businesses;

create policy "businesses_select_by_permission"
on public.businesses
for select
to authenticated
using (public.can_view_module('Businesses'));

create policy "businesses_insert_by_permission"
on public.businesses
for insert
to authenticated
with check (public.can_create_module('Businesses'));

create policy "businesses_update_by_permission"
on public.businesses
for update
to authenticated
using (public.can_edit_module('Businesses'))
with check (public.can_edit_module('Businesses'));

create policy "businesses_delete_by_permission"
on public.businesses
for delete
to authenticated
using (public.can_delete_module('Businesses'));

drop policy if exists "tickets_select_by_permission" on public.tickets;
drop policy if exists "tickets_insert_by_permission" on public.tickets;
drop policy if exists "tickets_update_by_permission" on public.tickets;
drop policy if exists "tickets_delete_by_permission" on public.tickets;

create policy "tickets_select_by_permission"
on public.tickets
for select
to authenticated
using (public.can_view_module('Tickets'));

create policy "tickets_insert_by_permission"
on public.tickets
for insert
to authenticated
with check (public.can_create_module('Tickets'));

create policy "tickets_update_by_permission"
on public.tickets
for update
to authenticated
using (public.can_edit_module('Tickets'))
with check (public.can_edit_module('Tickets'));

create policy "tickets_delete_by_permission"
on public.tickets
for delete
to authenticated
using (public.can_delete_module('Tickets'));

drop policy if exists "product_events_select_by_permission" on public.product_events;
drop policy if exists "product_events_insert_by_permission" on public.product_events;
drop policy if exists "product_events_update_by_permission" on public.product_events;
drop policy if exists "product_events_delete_by_permission" on public.product_events;

create policy "product_events_select_by_permission"
on public.product_events
for select
to authenticated
using (public.can_view_module('Product Log'));

create policy "product_events_insert_by_permission"
on public.product_events
for insert
to authenticated
with check (public.can_create_module('Product Log'));

create policy "product_events_update_by_permission"
on public.product_events
for update
to authenticated
using (public.can_edit_module('Product Log'))
with check (public.can_edit_module('Product Log'));

create policy "product_events_delete_by_permission"
on public.product_events
for delete
to authenticated
using (public.can_delete_module('Product Log'));

drop policy if exists "referrals_select_by_permission" on public.referrals;
drop policy if exists "referrals_insert_by_permission" on public.referrals;
drop policy if exists "referrals_update_by_permission" on public.referrals;
drop policy if exists "referrals_delete_by_permission" on public.referrals;

create policy "referrals_select_by_permission"
on public.referrals
for select
to authenticated
using (public.can_view_module('Referrals'));

create policy "referrals_insert_by_permission"
on public.referrals
for insert
to authenticated
with check (public.can_create_module('Referrals'));

create policy "referrals_update_by_permission"
on public.referrals
for update
to authenticated
using (public.can_edit_module('Referrals'))
with check (public.can_edit_module('Referrals'));

create policy "referrals_delete_by_permission"
on public.referrals
for delete
to authenticated
using (public.can_delete_module('Referrals'));

drop policy if exists "partners_select_by_permission" on public.partners;
drop policy if exists "partners_insert_by_permission" on public.partners;
drop policy if exists "partners_update_by_permission" on public.partners;
drop policy if exists "partners_delete_by_permission" on public.partners;

create policy "partners_select_by_permission"
on public.partners
for select
to authenticated
using (public.can_view_module('Partners'));

create policy "partners_insert_by_permission"
on public.partners
for insert
to authenticated
with check (public.can_create_module('Partners'));

create policy "partners_update_by_permission"
on public.partners
for update
to authenticated
using (public.can_edit_module('Partners'))
with check (public.can_edit_module('Partners'));

create policy "partners_delete_by_permission"
on public.partners
for delete
to authenticated
using (public.can_delete_module('Partners'));

drop policy if exists "partner_communication_log_select_by_permission" on public.partner_communication_log;
drop policy if exists "partner_communication_log_insert_by_permission" on public.partner_communication_log;
drop policy if exists "partner_communication_log_update_by_permission" on public.partner_communication_log;
drop policy if exists "partner_communication_log_delete_by_permission" on public.partner_communication_log;

create policy "partner_communication_log_select_by_permission"
on public.partner_communication_log
for select
to authenticated
using (public.can_view_module('Partners'));

create policy "partner_communication_log_insert_by_permission"
on public.partner_communication_log
for insert
to authenticated
with check (public.can_create_module('Partners'));

create policy "partner_communication_log_update_by_permission"
on public.partner_communication_log
for update
to authenticated
using (public.can_edit_module('Partners'))
with check (public.can_edit_module('Partners'));

create policy "partner_communication_log_delete_by_permission"
on public.partner_communication_log
for delete
to authenticated
using (public.can_delete_module('Partners'));
