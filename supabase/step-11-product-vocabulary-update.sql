-- Payscribe CRM - Step 11: Product vocabulary update.
-- Run this script in the Supabase SQL editor before using the new product values in forms.

alter type public.lead_product_interest add value if not exists 'VTU';
alter type public.lead_product_interest add value if not exists 'Bills and Subscription';
alter type public.lead_product_interest add value if not exists 'Airtime';
alter type public.lead_product_interest add value if not exists 'Data';
alter type public.lead_product_interest add value if not exists 'Electricity';
alter type public.lead_product_interest add value if not exists 'Cable TV Subscription';
alter type public.lead_product_interest add value if not exists 'Betting Platform Funding';

alter type public.business_product add value if not exists 'VTU';
alter type public.business_product add value if not exists 'Bills and Subscription';
alter type public.business_product add value if not exists 'Airtime';
alter type public.business_product add value if not exists 'Data';
alter type public.business_product add value if not exists 'Electricity';
alter type public.business_product add value if not exists 'Cable TV Subscription';
alter type public.business_product add value if not exists 'Betting Platform Funding';

alter type public.product_area add value if not exists 'VTU';
alter type public.product_area add value if not exists 'Bills and Subscription';
alter type public.product_area add value if not exists 'Airtime';
alter type public.product_area add value if not exists 'Data';
alter type public.product_area add value if not exists 'Electricity';
alter type public.product_area add value if not exists 'Cable TV Subscription';
alter type public.product_area add value if not exists 'Betting Platform Funding';

alter type public.ticket_issue_category add value if not exists 'VTU';
alter type public.ticket_issue_category add value if not exists 'Bills and Subscription';
alter type public.ticket_issue_category add value if not exists 'Airtime';
alter type public.ticket_issue_category add value if not exists 'Data';
alter type public.ticket_issue_category add value if not exists 'Electricity';
alter type public.ticket_issue_category add value if not exists 'Cable TV Subscription';
alter type public.ticket_issue_category add value if not exists 'Betting Platform Funding';
