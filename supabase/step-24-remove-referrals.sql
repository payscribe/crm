-- Payscribe CRM - Step 24: Remove the orphaned referrals feature.
-- Run this in the Supabase SQL editor.
--
-- The referrals table, its enum, sequence, trigger, indexes, and RLS policies
-- were created in step-1/step-2 but have never been read or written by any
-- application code (confirmed by repo-wide grep). This migration drops all of
-- it, plus two unrelated-but-also-dead self-referential columns on
-- businesses (referral_code, referred_by_business_id).
--
-- Note: the 'Referrals' value inside the crm_module enum is intentionally
-- NOT removed here. Postgres cannot cheaply drop a single enum value - doing
-- so would require rebuilding the crm_module type and re-pointing the
-- permissions, permission_templates, and automation_events columns that
-- reference it, for zero functional benefit once no rows/app code reference
-- it. The value becomes inert once the cleanup below runs.

delete from public.permissions where module = 'Referrals';

update public.permission_templates
set permissions = permissions - 'Referrals'
where permissions ? 'Referrals';

drop policy if exists "referrals_select_by_permission" on public.referrals;
drop policy if exists "referrals_insert_by_permission" on public.referrals;
drop policy if exists "referrals_update_by_permission" on public.referrals;
drop policy if exists "referrals_delete_by_permission" on public.referrals;

drop trigger if exists set_referrals_updated_at on public.referrals;

drop table if exists public.referrals cascade;

drop sequence if exists public.referrals_seq;

drop type if exists public.referral_status;

alter table public.businesses drop column if exists referral_code;
alter table public.businesses drop column if exists referred_by_business_id;
