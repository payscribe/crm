-- Payscribe CRM - Step 14: Custom partner type support.
-- Run this in Supabase before saving a partner with Partner type = Other.

alter table public.partners
  add column if not exists custom_partner_type text;

alter table public.partners
  drop constraint if exists partners_custom_partner_type_required;

alter table public.partners
  add constraint partners_custom_partner_type_required
  check (
    partner_type <> 'Other'
    or (custom_partner_type is not null and length(trim(custom_partner_type)) > 0)
  );
