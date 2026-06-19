-- Payscribe CRM - Step 15: Admin-managed option lists.
-- Run this in Supabase SQL editor before using Settings > Option Lists.

alter table public.leads
  alter column product_interest type text[]
  using product_interest::text[];

alter table public.product_events
  alter column affected_products type text[]
  using affected_products::text[];

create table if not exists public.crm_options (
  option_id uuid primary key default gen_random_uuid(),
  option_group text not null check (
    option_group in (
      'lead_product_interest',
      'ticket_sub_category',
      'product_area'
    )
  ),
  label text not null check (length(trim(label)) > 0),
  parent_label text,
  sort_order integer not null default 0 check (sort_order >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_crm_options_unique_label
  on public.crm_options (
    option_group,
    lower(label),
    coalesce(parent_label, '')
  );

create index if not exists idx_crm_options_group_active
  on public.crm_options (option_group, is_active, parent_label, sort_order);

drop trigger if exists set_crm_options_updated_at on public.crm_options;
create trigger set_crm_options_updated_at
before update on public.crm_options
for each row execute function public.set_updated_at();

insert into public.crm_options (option_group, label, sort_order)
select seed.option_group, seed.label, seed.sort_order
from (
  values
    ('lead_product_interest', 'USD Virtual Card', 1),
    ('lead_product_interest', 'NGN Virtual Account', 2),
    ('lead_product_interest', 'API Integration', 3),
    ('lead_product_interest', 'Merchant Account', 4),
    ('lead_product_interest', 'Cross-border Payments', 5),
    ('lead_product_interest', 'Stablecoin Payments', 6),
    ('lead_product_interest', 'White-label Infrastructure', 7),
    ('lead_product_interest', 'Bulk Payouts', 8),
    ('lead_product_interest', 'Contactless Card', 9),
    ('lead_product_interest', 'VTU', 10),
    ('lead_product_interest', 'Bills and Subscription', 11),
    ('lead_product_interest', 'Airtime', 12),
    ('lead_product_interest', 'Data', 13),
    ('lead_product_interest', 'Electricity', 14),
    ('lead_product_interest', 'Cable TV Subscription', 15),
    ('lead_product_interest', 'Betting Platform Funding', 16),
    ('product_area', 'Virtual NGN Accounts', 1),
    ('product_area', 'USD Virtual Cards', 2),
    ('product_area', 'Contactless Cards', 3),
    ('product_area', 'Stablecoin Payments', 4),
    ('product_area', 'API', 5),
    ('product_area', 'Dashboard', 6),
    ('product_area', 'Webhooks', 7),
    ('product_area', 'Settlement', 8),
    ('product_area', 'VTU', 9),
    ('product_area', 'Bills and Subscription', 10),
    ('product_area', 'Airtime', 11),
    ('product_area', 'Data', 12),
    ('product_area', 'Electricity', 13),
    ('product_area', 'Cable TV Subscription', 14),
    ('product_area', 'Betting Platform Funding', 15),
    ('product_area', 'All Products', 16)
) as seed(option_group, label, sort_order)
where not exists (
  select 1
  from public.crm_options existing
  where existing.option_group = seed.option_group
    and lower(existing.label) = lower(seed.label)
    and coalesce(existing.parent_label, '') = ''
);

insert into public.crm_options (option_group, parent_label, label, sort_order)
select 'ticket_sub_category', seed.parent_label, seed.label, seed.sort_order
from (
  values
    ('Complaint', 'Card Decline', 1),
    ('Complaint', 'Settlement Delay', 2),
    ('Complaint', 'KYB Query', 3),
    ('Complaint', 'API Error', 4),
    ('Complaint', 'Webhook Issue', 5),
    ('Complaint', 'Account Access', 6),
    ('Complaint', 'Compliance Query', 7),
    ('Complaint', 'Refund Request', 8),
    ('Complaint', 'VTU', 9),
    ('Complaint', 'Bills and Subscription', 10),
    ('Complaint', 'Airtime', 11),
    ('Complaint', 'Data', 12),
    ('Complaint', 'Electricity', 13),
    ('Complaint', 'Cable TV Subscription', 14),
    ('Complaint', 'Betting Platform Funding', 15),
    ('Complaint', 'Other', 16),
    ('Request', 'Onboarding Help', 1),
    ('Request', 'Feature Request', 2),
    ('Request', 'Refund Request', 3),
    ('Request', 'Account Access', 4),
    ('Request', 'VTU', 5),
    ('Request', 'Bills and Subscription', 6),
    ('Request', 'Airtime', 7),
    ('Request', 'Data', 8),
    ('Request', 'Electricity', 9),
    ('Request', 'Cable TV Subscription', 10),
    ('Request', 'Betting Platform Funding', 11),
    ('Request', 'Other', 12),
    ('Inquiry', 'KYB Query', 1),
    ('Inquiry', 'Compliance Query', 2),
    ('Inquiry', 'Onboarding Help', 3),
    ('Inquiry', 'Feature Request', 4),
    ('Inquiry', 'VTU', 5),
    ('Inquiry', 'Bills and Subscription', 6),
    ('Inquiry', 'Airtime', 7),
    ('Inquiry', 'Data', 8),
    ('Inquiry', 'Electricity', 9),
    ('Inquiry', 'Cable TV Subscription', 10),
    ('Inquiry', 'Betting Platform Funding', 11),
    ('Inquiry', 'Other', 12)
) as seed(parent_label, label, sort_order)
where not exists (
  select 1
  from public.crm_options existing
  where existing.option_group = 'ticket_sub_category'
    and lower(existing.label) = lower(seed.label)
    and existing.parent_label = seed.parent_label
);

alter table public.crm_options enable row level security;

drop policy if exists "crm_options_select_authenticated" on public.crm_options;
drop policy if exists "crm_options_insert_super_admin" on public.crm_options;
drop policy if exists "crm_options_update_super_admin" on public.crm_options;
drop policy if exists "crm_options_delete_super_admin" on public.crm_options;

create policy "crm_options_select_authenticated"
on public.crm_options
for select
to authenticated
using (true);

create policy "crm_options_insert_super_admin"
on public.crm_options
for insert
to authenticated
with check (public.current_user_is_super_admin());

create policy "crm_options_update_super_admin"
on public.crm_options
for update
to authenticated
using (public.current_user_is_super_admin())
with check (public.current_user_is_super_admin());

create policy "crm_options_delete_super_admin"
on public.crm_options
for delete
to authenticated
using (public.current_user_is_super_admin());
