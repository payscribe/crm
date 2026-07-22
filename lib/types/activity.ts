export type CrmRecordType =
  | "Business"
  | "Lead"
  | "Partner"
  | "Ticket"
  | "Product Event";

export type ActivitySource = "activity_log" | "communication_log" | "ticket_note";

export type ActivityEntry = {
  id: string;
  source: ActivitySource;
  entityType: CrmRecordType;
  entityId: string;
  date: string;
  channel: string | null;
  direction: "Inbound" | "Outbound" | null;
  actorId: string | null;
  summary: string;
};

export type ActivityLogRow = {
  activity_id: string;
  entity_type: CrmRecordType;
  entity_id: string;
  summary: string;
  channel: string | null;
  direction: "Inbound" | "Outbound" | null;
  created_by: string;
  created_at: string;
};
