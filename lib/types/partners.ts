export type PartnerType =
  | "Card Infrastructure Provider"
  | "Banking / Financial Institution"
  | "Stablecoin / Crypto Rails"
  | "KYC / KYB Verification Provider"
  | "Payment Gateway"
  | "Mobile Money Provider"
  | "Compliance / Legal Partner"
  | "Cloud / Infrastructure Provider"
  | "Marketing / Distribution Partner"
  | "Investor / Funding"
  | "Technology Partner"
  | "Regulatory Body"
  | "Other";

export type PartnerOutreachStatus =
  | "Identified"
  | "Outreach Sent"
  | "In Conversation"
  | "Meeting Scheduled"
  | "Proposal Received"
  | "Under Review"
  | "On Hold"
  | "Declined by Them"
  | "Declined by Us"
  | "Active Partner"
  | "Former Partner";

export type PartnerPriority = "Critical" | "High" | "Medium" | "Low";

export type PartnerTag =
  | "Card Issuing"
  | "Intra-Africa"
  | "Q2 Priority"
  | "Licence Required"
  | "Revisit After Funding"
  | "Active"
  | "Regulatory";

export type Partner = {
  partner_id: string;
  organisation_name: string;
  website: string | null;
  country: string | null;
  partner_type: PartnerType;
  custom_partner_type: string | null;
  service_description: string | null;
  reason_for_outreach: string | null;
  payscribe_contact: string | null;
  their_contact_name: string | null;
  their_contact_title: string | null;
  their_contact_email: string | null;
  their_contact_phone: string | null;
  outreach_status: PartnerOutreachStatus;
  outcome_reason: string | null;
  date_first_contacted: string | null;
  date_last_interaction: string | null;
  next_review_date: string | null;
  would_revisit: boolean;
  priority: PartnerPriority | null;
  tags: PartnerTag[] | null;
  needs_reassignment: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PartnerCommunicationChannel =
  | "Email"
  | "Phone Call"
  | "WhatsApp"
  | "LinkedIn"
  | "In-person Meeting"
  | "Video Call";

export type PartnerCommunicationDirection = "Inbound" | "Outbound";

export type PartnerCommunicationLog = {
  log_id: string;
  partner_id: string;
  date: string;
  channel: PartnerCommunicationChannel;
  direction: PartnerCommunicationDirection;
  participants_payscribe: string | null;
  participants_partner: string | null;
  summary: string;
  outcome: string | null;
  next_step: string | null;
  follow_up_date: string | null;
  logged_by: string;
  created_at: string;
};
