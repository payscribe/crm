import type {
  PartnerCommunicationChannel,
  PartnerCommunicationDirection,
  PartnerOutreachStatus,
  PartnerPriority,
  PartnerTag,
  PartnerType
} from "@/lib/types/partners";

export const partnerTypes: PartnerType[] = [
  "Card Infrastructure Provider",
  "Banking / Financial Institution",
  "Stablecoin / Crypto Rails",
  "KYC / KYB Verification Provider",
  "Payment Gateway",
  "Mobile Money Provider",
  "Compliance / Legal Partner",
  "Cloud / Infrastructure Provider",
  "Marketing / Distribution Partner",
  "Investor / Funding",
  "Technology Partner",
  "Regulatory Body",
  "Other"
];

export const partnerOutreachStatuses: PartnerOutreachStatus[] = [
  "Identified",
  "Outreach Sent",
  "In Conversation",
  "Meeting Scheduled",
  "Proposal Received",
  "Under Review",
  "On Hold",
  "Declined by Them",
  "Declined by Us",
  "Active Partner",
  "Former Partner"
];

export const partnerPriorities: PartnerPriority[] = [
  "Critical",
  "High",
  "Medium",
  "Low"
];

export const partnerTags: PartnerTag[] = [
  "Card Issuing",
  "Intra-Africa",
  "Q2 Priority",
  "Licence Required",
  "Revisit After Funding",
  "Active",
  "Regulatory"
];

export const partnerCommunicationChannels: PartnerCommunicationChannel[] = [
  "Email",
  "Phone Call",
  "WhatsApp",
  "LinkedIn",
  "In-person Meeting",
  "Video Call"
];

export const partnerCommunicationDirections: PartnerCommunicationDirection[] = [
  "Outbound",
  "Inbound"
];

export const statusesRequiringOutcome: PartnerOutreachStatus[] = [
  "Declined by Them",
  "Declined by Us",
  "On Hold",
  "Former Partner"
];
