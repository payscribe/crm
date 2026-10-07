alter table public.leads
add column if not exists business_type text check (
  business_type is null
  or business_type in (
    'Fintech',
    'SaaS / Software',
    'E-commerce / Marketplace',
    'Lending / Credit',
    'Investment / Wealthtech',
    'Healthtech',
    'Edtech',
    'Logistics / Mobility',
    'Retail / Consumer',
    'Others'
  )
);

create index if not exists idx_leads_business_type
on public.leads (business_type)
where business_type is not null;
