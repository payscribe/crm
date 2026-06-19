-- Payscribe CRM - Step 9: Read-only businesses and lead-to-business links.
-- Run this in Supabase before using "Link to Registered Business".

alter table public.leads
  add column if not exists linked_business_id text references public.businesses(business_id) on delete set null;

create index if not exists idx_leads_linked_business_id
on public.leads (linked_business_id);

update public.leads l
set
  linked_business_id = b.business_id,
  converted = true
from public.businesses b
where b.converted_lead_id = l.lead_id
  and l.linked_business_id is null;
