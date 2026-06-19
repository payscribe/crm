-- Payscribe CRM - Step 1: Database tables, constraints, indexes, and triggers.
-- Run this script in the Supabase SQL editor.
-- This step intentionally does not add RLS policies. RLS is Step 2 after confirmation.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'staff_status') then
    create type public.staff_status as enum ('Active', 'Inactive');
  end if;

  if not exists (select 1 from pg_type where typname = 'crm_module') then
    create type public.crm_module as enum (
      'Leads',
      'Businesses',
      'Tickets',
      'Partners',
      'Product Log',
      'Referrals',
      'Reports',
      'Settings'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'lead_source') then
    create type public.lead_source as enum (
      'Instagram',
      'X (Twitter)',
      'LinkedIn',
      'Facebook',
      'WhatsApp Community',
      'Referral',
      'Cold Outreach',
      'Website',
      'TechPoint Article',
      'Email Campaign',
      'Other'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'lead_product_interest') then
    create type public.lead_product_interest as enum (
      'USD Virtual Card',
      'NGN Virtual Account',
      'API Integration',
      'Merchant Account',
      'Cross-border Payments',
      'Stablecoin Payments',
      'White-label Infrastructure',
      'Bulk Payouts',
      'Contactless Card',
      'VTU',
      'Bills and Subscription',
      'Airtime',
      'Data',
      'Electricity',
      'Cable TV Subscription',
      'Betting Platform Funding'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'lead_stage') then
    create type public.lead_stage as enum (
      'New',
      'Contacted',
      'Engaged',
      'Qualified',
      'Demo Scheduled',
      'Onboarding',
      'Converted',
      'Closed Lost'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'lead_status') then
    create type public.lead_status as enum (
      'Hot',
      'Warm',
      'Cold',
      'On Hold',
      'Closed Won',
      'Closed Lost'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'communication_channel') then
    create type public.communication_channel as enum (
      'WhatsApp',
      'Email',
      'Phone Call',
      'LinkedIn DM',
      'Instagram DM',
      'In-person',
      'Video Call'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'communication_direction') then
    create type public.communication_direction as enum ('Inbound', 'Outbound');
  end if;

  if not exists (select 1 from pg_type where typname = 'kyb_status') then
    create type public.kyb_status as enum (
      'Not Submitted',
      'Submitted',
      'Approved',
      'Rejected',
      'Resubmitted'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'business_lifecycle_stage') then
    create type public.business_lifecycle_stage as enum (
      'Registered',
      'KYB Pending',
      'KYB Approved',
      'First Transaction',
      'Active',
      'At Risk',
      'Suspended',
      'Churned'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'business_product') then
    create type public.business_product as enum (
      'Virtual NGN Accounts',
      'USD Virtual Cards',
      'Contactless Cards',
      'Stablecoin Payments',
      'API Integration',
      'White-label Infrastructure',
      'Payment Links',
      'Bank Settlement',
      'VTU',
      'Bills and Subscription',
      'Airtime',
      'Data',
      'Electricity',
      'Cable TV Subscription',
      'Betting Platform Funding'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'integration_type') then
    create type public.integration_type as enum (
      'Dashboard Only',
      'API Web',
      'API Mobile App',
      'White-label'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'monthly_volume_range') then
    create type public.monthly_volume_range as enum (
      'None',
      'Under 100k',
      '100k to 500k',
      '500k to 2M',
      'Above 2M'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'settlement_type') then
    create type public.settlement_type as enum ('Instant', '9pm', 'Bank Settlement');
  end if;

  if not exists (select 1 from pg_type where typname = 'ticket_channel') then
    create type public.ticket_channel as enum ('WhatsApp', 'Email', 'Phone', 'Slack', 'Dashboard');
  end if;

  if not exists (select 1 from pg_type where typname = 'ticket_issue_category') then
    create type public.ticket_issue_category as enum (
      'Card Decline',
      'Settlement Delay',
      'KYB Query',
      'API Error',
      'Webhook Issue',
      'Account Access',
      'Compliance Query',
      'Refund Request',
      'Onboarding Help',
      'Feature Request',
      'VTU',
      'Bills and Subscription',
      'Airtime',
      'Data',
      'Electricity',
      'Cable TV Subscription',
      'Betting Platform Funding',
      'Other'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'ticket_priority') then
    create type public.ticket_priority as enum ('Low', 'Medium', 'High', 'Critical');
  end if;

  if not exists (select 1 from pg_type where typname = 'ticket_status') then
    create type public.ticket_status as enum (
      'Open',
      'In Progress',
      'Waiting on Business',
      'Waiting on Engineering',
      'Resolved',
      'Closed'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'product_event_type') then
    create type public.product_event_type as enum (
      'Feature Launch',
      'Bug Fix',
      'Scheduled Maintenance',
      'Unplanned Outage',
      'Product Update',
      'Security Patch'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'product_area') then
    create type public.product_area as enum (
      'Virtual NGN Accounts',
      'USD Virtual Cards',
      'Contactless Cards',
      'Stablecoin Payments',
      'API',
      'Dashboard',
      'Webhooks',
      'Settlement',
      'VTU',
      'Bills and Subscription',
      'Airtime',
      'Data',
      'Electricity',
      'Cable TV Subscription',
      'Betting Platform Funding',
      'All Products'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'severity') then
    create type public.severity as enum ('Info', 'Low', 'Medium', 'High', 'Critical');
  end if;

  if not exists (select 1 from pg_type where typname = 'product_event_status') then
    create type public.product_event_status as enum ('Active', 'Monitoring', 'Resolved');
  end if;

  if not exists (select 1 from pg_type where typname = 'partner_type') then
    create type public.partner_type as enum (
      'Card Infrastructure Provider',
      'Banking / Financial Institution',
      'Stablecoin / Crypto Rails',
      'KYC / KYB Verification Provider',
      'Payment Gateway',
      'Mobile Money Provider',
      'Compliance / Legal Partner',
      'Cloud / Infrastructure Provider',
      'Marketing / Distribution Partner',
      'Investor / Funding',
      'Technology Partner',
      'Regulatory Body',
      'Other'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'partner_outreach_status') then
    create type public.partner_outreach_status as enum (
      'Identified',
      'Outreach Sent',
      'In Conversation',
      'Meeting Scheduled',
      'Proposal Received',
      'Under Review',
      'On Hold',
      'Declined by Them',
      'Declined by Us',
      'Active Partner',
      'Former Partner'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'partner_priority') then
    create type public.partner_priority as enum ('Critical', 'High', 'Medium', 'Low');
  end if;

  if not exists (select 1 from pg_type where typname = 'partner_tag') then
    create type public.partner_tag as enum (
      'Card Issuing',
      'Intra-Africa',
      'Q2 Priority',
      'Licence Required',
      'Revisit After Funding',
      'Active',
      'Regulatory'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'partner_communication_channel') then
    create type public.partner_communication_channel as enum (
      'Email',
      'Phone Call',
      'WhatsApp',
      'LinkedIn',
      'In-person Meeting',
      'Video Call'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'referral_status') then
    create type public.referral_status as enum (
      'Pending',
      'Contacted',
      'Qualified',
      'Converted',
      'Rejected'
    );
  end if;
end $$;

create sequence if not exists public.leads_seq start 1;
create sequence if not exists public.businesses_seq start 1;
create sequence if not exists public.tickets_seq start 1;
create sequence if not exists public.product_events_seq start 1;
create sequence if not exists public.partners_seq start 1;
create sequence if not exists public.referrals_seq start 1;

create or replace function public.format_record_id(prefix text, sequence_name text)
returns text
language plpgsql
as $$
declare
  next_number bigint;
begin
  execute format('select nextval(%L::regclass)', sequence_name) into next_number;
  return prefix || '-' || lpad(next_number::text, 5, '0');
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) > 0),
  email text not null unique check (position('@' in email) > 1),
  job_title text,
  department text,
  slack_user_id text,
  status public.staff_status not null default 'Active',
  is_super_admin boolean not null default false,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_users_updated_at on public.users;
create trigger set_users_updated_at
before update on public.users
for each row execute function public.set_updated_at();

create table if not exists public.permissions (
  permission_id bigint generated by default as identity primary key,
  user_id uuid not null references public.users(user_id) on delete cascade,
  module public.crm_module not null,
  can_view boolean not null default false,
  can_create boolean not null default false,
  can_edit boolean not null default false,
  can_delete boolean not null default false,
  can_assign boolean not null default false,
  updated_by uuid references public.users(user_id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (user_id, module)
);

drop trigger if exists set_permissions_updated_at on public.permissions;
create trigger set_permissions_updated_at
before update on public.permissions
for each row execute function public.set_updated_at();

create or replace function public.create_default_permissions_for_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.permissions (
    user_id,
    module,
    can_view,
    can_create,
    can_edit,
    can_delete,
    can_assign
  )
  select
    new.user_id,
    module_name,
    false,
    false,
    false,
    false,
    false
  from unnest(enum_range(null::public.crm_module)) as module_name
  on conflict (user_id, module) do nothing;

  return new;
end;
$$;

drop trigger if exists create_permissions_after_user_insert on public.users;
create trigger create_permissions_after_user_insert
after insert on public.users
for each row execute function public.create_default_permissions_for_user();

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (
    user_id,
    full_name,
    email,
    job_title,
    department,
    slack_user_id
  )
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)),
    new.email,
    nullif(trim(new.raw_user_meta_data->>'job_title'), ''),
    nullif(trim(new.raw_user_meta_data->>'department'), ''),
    nullif(trim(new.raw_user_meta_data->>'slack_user_id'), '')
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists create_profile_after_auth_user_insert on auth.users;
create trigger create_profile_after_auth_user_insert
after insert on auth.users
for each row execute function public.create_profile_for_auth_user();

create table if not exists public.permission_templates (
  template_id uuid primary key default gen_random_uuid(),
  template_name text not null unique check (length(trim(template_name)) > 0),
  description text,
  permissions jsonb not null default '{}'::jsonb,
  created_by uuid references public.users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_permission_templates_updated_at on public.permission_templates;
create trigger set_permission_templates_updated_at
before update on public.permission_templates
for each row execute function public.set_updated_at();

create table if not exists public.leads (
  lead_id text primary key default public.format_record_id('PS', 'public.leads_seq'),
  full_name text not null check (length(trim(full_name)) > 0),
  business_name text,
  phone text not null check (length(trim(phone)) > 0),
  email text check (email is null or position('@' in email) > 1),
  source public.lead_source not null,
  referral_source_name text,
  product_interest public.lead_product_interest[] not null check (array_length(product_interest, 1) > 0),
  stage public.lead_stage not null default 'New',
  status public.lead_status not null default 'Warm',
  assigned_to uuid not null references public.users(user_id) on delete restrict,
  last_contact_date date,
  next_followup_date date not null,
  last_message_summary text check (last_message_summary is null or length(last_message_summary) <= 200),
  notes text,
  converted boolean not null default false,
  needs_reassignment boolean not null default false,
  slack_channel_id text,
  slack_thread_ts text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (source = 'Referral' and referral_source_name is not null and length(trim(referral_source_name)) > 0)
    or source <> 'Referral'
  )
);

drop trigger if exists set_leads_updated_at on public.leads;
create trigger set_leads_updated_at
before update on public.leads
for each row execute function public.set_updated_at();

create table if not exists public.lead_communication_log (
  log_id uuid primary key default gen_random_uuid(),
  lead_id text not null references public.leads(lead_id) on delete cascade,
  date timestamptz not null,
  channel public.communication_channel not null,
  direction public.communication_direction not null,
  summary text not null check (length(trim(summary)) > 0),
  action_taken text,
  next_step text,
  follow_up_date date,
  logged_by uuid not null references public.users(user_id) on delete restrict,
  created_at timestamptz not null default now()
);

create or replace function public.sync_lead_after_communication_log()
returns trigger
language plpgsql
as $$
begin
  update public.leads
  set
    last_contact_date = new.date::date,
    next_followup_date = coalesce(new.follow_up_date, next_followup_date),
    updated_at = now()
  where lead_id = new.lead_id;

  return new;
end;
$$;

drop trigger if exists sync_lead_after_communication_log_insert on public.lead_communication_log;
create trigger sync_lead_after_communication_log_insert
after insert on public.lead_communication_log
for each row execute function public.sync_lead_after_communication_log();

create table if not exists public.businesses (
  business_id text primary key default public.format_record_id('BIZ', 'public.businesses_seq'),
  business_name text not null check (length(trim(business_name)) > 0),
  owner_name text,
  email text not null check (position('@' in email) > 1),
  phone text,
  registration_date date,
  cac_rc_number text,
  kyb_status public.kyb_status not null default 'Not Submitted',
  kyb_submission_date date,
  kyb_approval_date date,
  lifecycle_stage public.business_lifecycle_stage not null,
  products_active public.business_product[] default '{}'::public.business_product[],
  integration_type public.integration_type,
  monthly_volume_range public.monthly_volume_range,
  last_transaction_date date,
  settlement_type public.settlement_type,
  assigned_cs_owner uuid references public.users(user_id) on delete set null,
  referral_code text unique,
  referred_by_business_id text references public.businesses(business_id) on delete set null,
  converted_lead_id text unique references public.leads(lead_id) on delete set null,
  transaction_limit_amount numeric(14, 2),
  current_transaction_volume numeric(14, 2) not null default 0,
  indemnity_form_on_file boolean not null default false,
  needs_reassignment boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (transaction_limit_amount is null or transaction_limit_amount >= 0),
  check (current_transaction_volume >= 0)
);

drop trigger if exists set_businesses_updated_at on public.businesses;
create trigger set_businesses_updated_at
before update on public.businesses
for each row execute function public.set_updated_at();

create table if not exists public.tickets (
  ticket_id text primary key default public.format_record_id('TKT', 'public.tickets_seq'),
  business_id text not null references public.businesses(business_id) on delete restrict,
  date_raised timestamptz not null default now(),
  reported_by text,
  channel_received public.ticket_channel not null,
  issue_category public.ticket_issue_category not null,
  issue_description text not null check (length(trim(issue_description)) > 0),
  priority public.ticket_priority not null,
  assigned_to uuid not null references public.users(user_id) on delete restrict,
  status public.ticket_status not null default 'Open',
  sla_deadline timestamptz,
  sla_breached boolean not null default false,
  resolution_notes text,
  resolved_date timestamptz,
  resolution_time_hours numeric(10, 2),
  recurring_issue boolean not null default false,
  linked_partner_id text,
  linked_product_event_id text,
  needs_reassignment boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_ticket_sla_and_resolution()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' or new.priority is distinct from old.priority or new.date_raised is distinct from old.date_raised then
    new.sla_deadline =
      new.date_raised +
      case new.priority
        when 'Critical' then interval '2 hours'
        when 'High' then interval '4 hours'
        when 'Medium' then interval '24 hours'
        when 'Low' then interval '48 hours'
      end;
  end if;

  if tg_op = 'UPDATE'
    and new.status = 'Resolved'
    and old.status is distinct from 'Resolved'
    and new.resolved_date is null then
    new.resolved_date = now();
  end if;

  if new.resolved_date is not null then
    new.resolution_time_hours = round((extract(epoch from (new.resolved_date - new.date_raised)) / 3600)::numeric, 2);
  end if;

  new.sla_breached = now() > new.sla_deadline and new.status not in ('Resolved', 'Closed');
  new.updated_at = now();

  return new;
end;
$$;

drop trigger if exists set_ticket_sla_and_resolution_before_insert_update on public.tickets;
create trigger set_ticket_sla_and_resolution_before_insert_update
before insert or update on public.tickets
for each row execute function public.set_ticket_sla_and_resolution();

create table if not exists public.product_events (
  event_id text primary key default public.format_record_id('EVT', 'public.product_events_seq'),
  event_type public.product_event_type not null,
  title text not null check (length(trim(title)) > 0),
  description text not null check (length(trim(description)) > 0),
  affected_products public.product_area[] not null check (array_length(affected_products, 1) > 0),
  severity public.severity,
  status public.product_event_status not null default 'Active',
  posted_by uuid not null references public.users(user_id) on delete restrict,
  resolved_at timestamptz,
  resolution_time_hours numeric(10, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    event_type <> 'Unplanned Outage'
    or severity is not null
  )
);

create or replace function public.set_product_event_resolution()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
    and new.status = 'Resolved'
    and old.status is distinct from 'Resolved'
    and new.resolved_at is null then
    new.resolved_at = now();
  end if;

  if new.resolved_at is not null then
    new.resolution_time_hours = round((extract(epoch from (new.resolved_at - new.created_at)) / 3600)::numeric, 2);
  end if;

  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_product_event_resolution_before_insert_update on public.product_events;
create trigger set_product_event_resolution_before_insert_update
before insert or update on public.product_events
for each row execute function public.set_product_event_resolution();

create table if not exists public.partners (
  partner_id text primary key default public.format_record_id('PTR', 'public.partners_seq'),
  organisation_name text not null check (length(trim(organisation_name)) > 0),
  website text,
  country text,
  partner_type public.partner_type not null,
  custom_partner_type text,
  service_description text,
  reason_for_outreach text,
  payscribe_contact uuid references public.users(user_id) on delete set null,
  their_contact_name text,
  their_contact_title text,
  their_contact_email text check (their_contact_email is null or position('@' in their_contact_email) > 1),
  their_contact_phone text,
  outreach_status public.partner_outreach_status not null default 'Identified',
  outcome_reason text,
  date_first_contacted date,
  date_last_interaction date,
  next_review_date date,
  would_revisit boolean not null default false,
  priority public.partner_priority,
  tags public.partner_tag[] default '{}'::public.partner_tag[],
  needs_reassignment boolean not null default false,
  notes text,
  slack_channel_id text,
  slack_thread_ts text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    outreach_status not in ('Declined by Them', 'Declined by Us', 'On Hold', 'Former Partner')
    or (outcome_reason is not null and length(trim(outcome_reason)) > 0)
  ),
  check (
    partner_type <> 'Other'
    or (custom_partner_type is not null and length(trim(custom_partner_type)) > 0)
  ),
  check (
    would_revisit = false
    or next_review_date is not null
  )
);

create or replace function public.set_partner_dates()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
    and old.outreach_status = 'Identified'
    and new.outreach_status = 'Outreach Sent'
    and new.date_first_contacted is null then
    new.date_first_contacted = current_date;
  end if;

  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_partner_dates_before_insert_update on public.partners;
create trigger set_partner_dates_before_insert_update
before insert or update on public.partners
for each row execute function public.set_partner_dates();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tickets_linked_partner_id_fkey'
  ) then
    alter table public.tickets
      add constraint tickets_linked_partner_id_fkey
      foreign key (linked_partner_id) references public.partners(partner_id) on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'tickets_linked_product_event_id_fkey'
  ) then
    alter table public.tickets
      add constraint tickets_linked_product_event_id_fkey
      foreign key (linked_product_event_id) references public.product_events(event_id) on delete set null;
  end if;
end $$;

create table if not exists public.partner_communication_log (
  log_id uuid primary key default gen_random_uuid(),
  partner_id text not null references public.partners(partner_id) on delete cascade,
  date timestamptz not null,
  channel public.partner_communication_channel not null,
  direction public.communication_direction not null,
  participants_payscribe text,
  participants_partner text,
  summary text not null check (length(trim(summary)) > 0),
  outcome text,
  next_step text,
  follow_up_date date,
  logged_by uuid not null references public.users(user_id) on delete restrict,
  created_at timestamptz not null default now()
);

create or replace function public.sync_partner_after_communication_log()
returns trigger
language plpgsql
as $$
begin
  update public.partners
  set
    date_last_interaction = new.date::date,
    next_review_date = coalesce(new.follow_up_date, next_review_date),
    updated_at = now()
  where partner_id = new.partner_id;

  return new;
end;
$$;

drop trigger if exists sync_partner_after_communication_log_insert on public.partner_communication_log;
create trigger sync_partner_after_communication_log_insert
after insert on public.partner_communication_log
for each row execute function public.sync_partner_after_communication_log();

create table if not exists public.referrals (
  referral_id text primary key default public.format_record_id('REF', 'public.referrals_seq'),
  referrer_business_id text references public.businesses(business_id) on delete set null,
  referred_business_id text references public.businesses(business_id) on delete set null,
  lead_id text references public.leads(lead_id) on delete set null,
  referral_source_name text,
  referral_code text,
  status public.referral_status not null default 'Pending',
  notes text,
  created_by uuid references public.users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    referrer_business_id is not null
    or referral_source_name is not null
    or referral_code is not null
  )
);

drop trigger if exists set_referrals_updated_at on public.referrals;
create trigger set_referrals_updated_at
before update on public.referrals
for each row execute function public.set_updated_at();

create or replace function public.flag_records_for_reassignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
    and old.status = 'Active'
    and new.status = 'Inactive' then
    update public.leads
    set needs_reassignment = true, updated_at = now()
    where assigned_to = new.user_id;

    update public.businesses
    set needs_reassignment = true, updated_at = now()
    where assigned_cs_owner = new.user_id;

    update public.tickets
    set needs_reassignment = true, updated_at = now()
    where assigned_to = new.user_id
      and status not in ('Resolved', 'Closed');

    update public.partners
    set needs_reassignment = true, updated_at = now()
    where payscribe_contact = new.user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists flag_records_after_user_deactivation on public.users;
create trigger flag_records_after_user_deactivation
after update of status on public.users
for each row execute function public.flag_records_for_reassignment();

create index if not exists idx_users_email on public.users (email);
create index if not exists idx_users_status on public.users (status);

create index if not exists idx_permissions_user_id on public.permissions (user_id);
create index if not exists idx_permissions_module on public.permissions (module);

create index if not exists idx_leads_assigned_to on public.leads (assigned_to);
create index if not exists idx_leads_stage on public.leads (stage);
create index if not exists idx_leads_status on public.leads (status);
create index if not exists idx_leads_source on public.leads (source);
create index if not exists idx_leads_next_followup_date on public.leads (next_followup_date);
create index if not exists idx_leads_created_at on public.leads (created_at);
create index if not exists idx_lead_communication_log_lead_id on public.lead_communication_log (lead_id);
create index if not exists idx_lead_communication_log_date on public.lead_communication_log (date);

create index if not exists idx_businesses_lifecycle_stage on public.businesses (lifecycle_stage);
create index if not exists idx_businesses_kyb_status on public.businesses (kyb_status);
create index if not exists idx_businesses_assigned_cs_owner on public.businesses (assigned_cs_owner);
create index if not exists idx_businesses_last_transaction_date on public.businesses (last_transaction_date);
create index if not exists idx_businesses_converted_lead_id on public.businesses (converted_lead_id);

create index if not exists idx_tickets_business_id on public.tickets (business_id);
create index if not exists idx_tickets_assigned_to on public.tickets (assigned_to);
create index if not exists idx_tickets_priority on public.tickets (priority);
create index if not exists idx_tickets_status on public.tickets (status);
create index if not exists idx_tickets_sla_deadline on public.tickets (sla_deadline);
create index if not exists idx_tickets_sla_breached on public.tickets (sla_breached);

create index if not exists idx_product_events_event_type on public.product_events (event_type);
create index if not exists idx_product_events_status on public.product_events (status);
create index if not exists idx_product_events_severity on public.product_events (severity);
create index if not exists idx_product_events_created_at on public.product_events (created_at);

create index if not exists idx_partners_payscribe_contact on public.partners (payscribe_contact);
create index if not exists idx_partners_outreach_status on public.partners (outreach_status);
create index if not exists idx_partners_priority on public.partners (priority);
create index if not exists idx_partners_next_review_date on public.partners (next_review_date);
create index if not exists idx_partners_date_first_contacted on public.partners (date_first_contacted);
create index if not exists idx_partner_communication_log_partner_id on public.partner_communication_log (partner_id);
create index if not exists idx_partner_communication_log_date on public.partner_communication_log (date);

create index if not exists idx_referrals_referrer_business_id on public.referrals (referrer_business_id);
create index if not exists idx_referrals_referred_business_id on public.referrals (referred_business_id);
create index if not exists idx_referrals_lead_id on public.referrals (lead_id);
create index if not exists idx_referrals_status on public.referrals (status);
