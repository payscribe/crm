import type {
  TicketAccountStatus,
  TicketCategory,
  TicketChannel,
  TicketIssueCategory,
  TicketInteractionMode,
  TicketPriority,
  TicketSubCategory,
  TicketStatus
} from "@/lib/types/tickets";

export const ticketChannels: TicketChannel[] = [
  "WhatsApp",
  "Email",
  "Phone",
  "Slack",
  "Dashboard"
];

export const ticketCategories: TicketCategory[] = [
  "Complaint",
  "Request",
  "Inquiry"
];

export const ticketSubCategories: TicketSubCategory[] = [
  "Card Decline",
  "Settlement Delay",
  "KYB Query",
  "API Error",
  "Webhook Issue",
  "Account Access",
  "Compliance Query",
  "Refund Request",
  "Onboarding Help",
  "Feature Request",
  "VTU",
  "Bills and Subscription",
  "Airtime",
  "Data",
  "Electricity",
  "Cable TV Subscription",
  "Betting Platform Funding",
  "Other"
];

export const ticketSubCategoriesByCategory: Record<TicketCategory, TicketSubCategory[]> = {
  Complaint: [
    "Card Decline",
    "Settlement Delay",
    "KYB Query",
    "API Error",
    "Webhook Issue",
    "Account Access",
    "Compliance Query",
    "Refund Request",
    "VTU",
    "Bills and Subscription",
    "Airtime",
    "Data",
    "Electricity",
    "Cable TV Subscription",
    "Betting Platform Funding",
    "Other"
  ],
  Request: [
    "Onboarding Help",
    "Feature Request",
    "Refund Request",
    "Account Access",
    "VTU",
    "Bills and Subscription",
    "Airtime",
    "Data",
    "Electricity",
    "Cable TV Subscription",
    "Betting Platform Funding",
    "Other"
  ],
  Inquiry: [
    "KYB Query",
    "Compliance Query",
    "Onboarding Help",
    "Feature Request",
    "VTU",
    "Bills and Subscription",
    "Airtime",
    "Data",
    "Electricity",
    "Cable TV Subscription",
    "Betting Platform Funding",
    "Other"
  ]
};

export const ticketIssueCategories: TicketIssueCategory[] = [
  ...ticketCategories
];

export const ticketPriorities: TicketPriority[] = [
  "Low",
  "Medium",
  "Critical"
];

export const ticketInteractionModes: TicketInteractionMode[] = [
  "Inbound",
  "Outbound"
];

export const ticketAccountStatuses: TicketAccountStatus[] = [
  "Active",
  "Suspended",
  "Under Review",
  "NA"
];

export const ticketStatuses: TicketStatus[] = [
  "Open",
  "Closed"
];

export const editableTicketStatuses: TicketStatus[] = ticketStatuses;
