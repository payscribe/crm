export type TicketChannel = "WhatsApp" | "Email" | "Phone" | "Slack" | "Dashboard";

export type TicketCategory = "Complaint" | "Request" | "Inquiry";

export type TicketSubCategory = string;

export type TicketIssueCategory = TicketCategory;

export type TicketPriority = "Low" | "Medium" | "Critical";

export type TicketInteractionMode = "Inbound" | "Outbound";

export type TicketAccountStatus =
  | "Active"
  | "Suspended"
  | "Under Review"
  | "NA";

export type TicketStatus = "Open" | "Closed";

export type TicketSource = "Manual" | "Email" | "Widget";

export type Ticket = {
  ticket_id: string;
  business_id: string | null;
  date_raised: string;
  reported_by: string | null;
  channel_received: TicketChannel;
  issue_category: TicketIssueCategory;
  sub_category: TicketSubCategory | string | null;
  interaction_mode: TicketInteractionMode;
  account_status: TicketAccountStatus;
  subject: string;
  issue_description: string;
  priority: TicketPriority;
  assigned_to: string | null;
  status: TicketStatus;
  sla_deadline: string | null;
  sla_breached: boolean;
  resolution_notes: string | null;
  resolved_date: string | null;
  resolution_time_hours: number | null;
  recurring_issue: boolean;
  linked_partner_id: string | null;
  linked_product_event_id: string | null;
  needs_reassignment: boolean;
  created_by: string | null;
  source: TicketSource;
  customer_email: string | null;
  customer_name: string | null;
  inbound_email_body: string | null;
  inbound_email_message_id: string | null;
  inbound_email_thread_id: string | null;
  customer_notified_at: string | null;
  closure_notified_at: string | null;
  service_id: string | null;
  widget_transaction_id: string | null;
  widget_session_id: string | null;
  widget_attachments: string[];
  created_at: string;
  updated_at: string;
};

export type SupportWidgetSession = {
  session_id: string;
  merchant_id: string;
  started_at: string;
  last_step_completed: string;
  completed: boolean;
  ticket_reference: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type InboundEmailEvent = {
  event_id: string;
  provider: string;
  provider_message_id: string;
  provider_thread_id: string | null;
  sender_email: string;
  sender_name: string | null;
  subject: string;
  body_text: string;
  received_at: string;
  raw_payload: Record<string, unknown>;
  processing_status:
    | "Pending"
    | "Processing"
    | "Processed"
    | "ProcessedWithEmailError"
    | "Failed";
  ticket_id: string | null;
  matched_business_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type TicketNote = {
  note_id: string;
  ticket_id: string;
  note_body: string;
  created_by: string | null;
  sender_type: "agent" | "customer" | "system";
  sender_name: string | null;
  client_message_id: string | null;
  attachments: import("@/lib/support/ticket-attachments").TicketAttachment[];
  created_at: string;
};
