import type { IssueStatus } from "@/lib/types/issues";
import { ticketPriorities, ticketSubCategories } from "@/lib/constants/tickets";
import type { TicketPriority, TicketSubCategory } from "@/lib/types/tickets";

// Issue categories reuse the granular ticket sub-category taxonomy so that a
// search across tickets and issues uses the same vocabulary.
export const issueCategories: TicketSubCategory[] = ticketSubCategories;

export const issuePriorities: TicketPriority[] = ticketPriorities;

export const issueStatuses: IssueStatus[] = ["Open", "In Progress", "Closed"];
