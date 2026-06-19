import type {
  LeadCommunicationChannel,
  LeadCommunicationDirection,
  LeadProductInterest,
  LeadSource,
  LeadStage,
  LeadStatus
} from "@/lib/types/leads";

export const leadSources: LeadSource[] = [
  "Instagram",
  "X (Twitter)",
  "LinkedIn",
  "Facebook",
  "WhatsApp Community",
  "Referral",
  "Cold Outreach",
  "Website",
  "TechPoint Article",
  "Email Campaign",
  "Other"
];

export const leadProductInterests: LeadProductInterest[] = [
  "USD Virtual Card",
  "NGN Virtual Account",
  "API Integration",
  "Merchant Account",
  "Cross-border Payments",
  "Stablecoin Payments",
  "White-label Infrastructure",
  "Bulk Payouts",
  "Contactless Card",
  "VTU",
  "Bills and Subscription",
  "Airtime",
  "Data",
  "Electricity",
  "Cable TV Subscription",
  "Betting Platform Funding"
];

export const leadStages: LeadStage[] = [
  "New",
  "Contacted",
  "Engaged",
  "Qualified",
  "Demo Scheduled",
  "Onboarding",
  "Converted",
  "Closed Lost"
];

export const leadStatuses: LeadStatus[] = [
  "Hot",
  "Warm",
  "Cold",
  "On Hold",
  "Closed Won",
  "Closed Lost"
];

export const leadCommunicationChannels: LeadCommunicationChannel[] = [
  "WhatsApp",
  "Email",
  "Phone Call",
  "LinkedIn DM",
  "Instagram DM",
  "In-person",
  "Video Call"
];

export const leadCommunicationDirections: LeadCommunicationDirection[] = [
  "Inbound",
  "Outbound"
];
