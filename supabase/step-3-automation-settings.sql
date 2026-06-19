-- Payscribe CRM - Step 3: Admin-configurable automation settings.
-- Run this after Step 1 and Step 2.

create table if not exists public.automation_settings (
  settings_id boolean primary key default true check (settings_id = true),
  kyb_not_submitted_days integer not null default 2 check (kyb_not_submitted_days >= 1),
  no_first_transaction_first_alert_days integer not null default 7 check (no_first_transaction_first_alert_days >= 1),
  no_first_transaction_at_risk_days integer not null default 21 check (no_first_transaction_at_risk_days >= 1),
  inactive_first_alert_days integer not null default 30 check (inactive_first_alert_days >= 1),
  inactive_second_alert_days integer not null default 60 check (inactive_second_alert_days >= 1),
  inactive_churn_days integer not null default 90 check (inactive_churn_days >= 1),
  transaction_limit_warning_percent integer not null default 80 check (
    transaction_limit_warning_percent >= 1
    and transaction_limit_warning_percent <= 100
  ),
  updated_by uuid references public.users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (no_first_transaction_at_risk_days >= no_first_transaction_first_alert_days),
  check (inactive_second_alert_days >= inactive_first_alert_days),
  check (inactive_churn_days >= inactive_second_alert_days)
);

insert into public.automation_settings (settings_id)
values (true)
on conflict (settings_id) do nothing;

drop trigger if exists set_automation_settings_updated_at on public.automation_settings;
create trigger set_automation_settings_updated_at
before update on public.automation_settings
for each row execute function public.set_updated_at();

alter table public.automation_settings enable row level security;

drop policy if exists "automation_settings_select_super_admin" on public.automation_settings;
drop policy if exists "automation_settings_insert_super_admin" on public.automation_settings;
drop policy if exists "automation_settings_update_super_admin" on public.automation_settings;
drop policy if exists "automation_settings_delete_super_admin" on public.automation_settings;

create policy "automation_settings_select_super_admin"
on public.automation_settings
for select
to authenticated
using (public.current_user_is_super_admin());

create policy "automation_settings_insert_super_admin"
on public.automation_settings
for insert
to authenticated
with check (public.current_user_is_super_admin());

create policy "automation_settings_update_super_admin"
on public.automation_settings
for update
to authenticated
using (public.current_user_is_super_admin())
with check (public.current_user_is_super_admin());

create policy "automation_settings_delete_super_admin"
on public.automation_settings
for delete
to authenticated
using (public.current_user_is_super_admin());
