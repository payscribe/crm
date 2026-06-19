export type LeadSource =
  | "Instagram"
  | "X (Twitter)"
  | "LinkedIn"
  | "Facebook"
  | "WhatsApp Community"
  | "Referral"
  | "Cold Outreach"
  | "Website"
  | "TechPoint Article"
  | "Email Campaign"
  | "Other";

export type LeadProductInterest = string;

export type LeadStage =
  | "New"
  | "Contacted"
  | "Engaged"
  | "Qualified"
  | "Demo Scheduled"
  | "Onboarding"
  | "Converted"
  | "Closed Lost";

export type LeadStatus =
  | "Hot"
  | "Warm"
  | "Cold"
  | "On Hold"
  | "Closed Won"
  | "Closed Lost";

export type Lead = {
  lead_id: string;
  full_name: string;
  business_name: string | null;
  phone: string;
  email: string | null;
  source: LeadSource;
  referral_source_name: string | null;
  product_interest: LeadProductInterest[];
  stage: LeadStage;
  status: LeadStatus;
  assigned_to: string;
  last_contact_date: string | null;
  next_followup_date: string;
  last_message_summary: string | null;
  notes: string | null;
  converted: boolean;
  linked_business_id: string | null;
  needs_reassignment: boolean;
  created_at: string;
  updated_at: string;
};

export type LeadCommunicationChannel =
  | "WhatsApp"
  | "Email"
  | "Phone Call"
  | "LinkedIn DM"
  | "Instagram DM"
  | "In-person"
  | "Video Call";

export type LeadCommunicationDirection = "Inbound" | "Outbound";

export type LeadCommunicationLog = {
  log_id: string;
  lead_id: string;
  date: string;
  channel: LeadCommunicationChannel;
  direction: LeadCommunicationDirection;
  summary: string;
  action_taken: string | null;
  next_step: string | null;
  follow_up_date: string | null;
  logged_by: string;
  created_at: string;
};
