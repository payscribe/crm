import type { TicketPriority, TicketSubCategory } from "@/lib/types/tickets";

export type IssueStatus = "Open" | "In Progress" | "Closed";

export type Issue = {
  issue_id: string;
  title: string;
  category: TicketSubCategory | null;
  description: string;
  priority: TicketPriority;
  linked_ticket_id: string | null;
  linked_business_id: string | null;
  assigned_to: string | null;
  status: IssueStatus;
  closing_notes: string | null;
  resolved_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
