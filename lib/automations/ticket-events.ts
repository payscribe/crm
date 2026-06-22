import type { NewAutomationEvent } from "@/lib/types/automation-events";
import type { Business } from "@/lib/types/businesses";
import type { Ticket } from "@/lib/types/tickets";
import type { StaffUser } from "@/lib/types/users";
import {
  slackFieldTable,
  ticketAssignedSlackMessage,
  ticketOpenedSlackMessage,
  withSlackMentions
} from "@/lib/notifications/ticket-messages";

function businessName(ticket: Ticket, businessById: Map<string, Business>) {
  return ticket.business_id
    ? businessById.get(ticket.business_id)?.business_name ?? ticket.business_id
    : "Unmatched email";
}

function assignee(ticket: Ticket, staffById: Map<string, StaffUser>) {
  return ticket.assigned_to ? staffById.get(ticket.assigned_to) ?? null : null;
}

function isOpen(ticket: Ticket) {
  return ticket.status !== "Closed";
}

function hoursOverdue(ticket: Ticket) {
  if (!ticket.sla_deadline) {
    return 0;
  }

  return Math.max(
    0,
    Math.round((Date.now() - new Date(ticket.sla_deadline).getTime()) / 3600000)
  );
}

function isHalfwayThroughSla(ticket: Ticket) {
  if (!ticket.sla_deadline || !isOpen(ticket)) {
    return false;
  }

  const raisedAt = new Date(ticket.date_raised).getTime();
  const deadline = new Date(ticket.sla_deadline).getTime();
  const halfway = raisedAt + (deadline - raisedAt) / 2;

  return Date.now() >= halfway && Date.now() < deadline;
}

function isSlaBreached(ticket: Ticket) {
  return (
    Boolean(ticket.sla_deadline) &&
    Date.now() > new Date(ticket.sla_deadline as string).getTime() &&
    isOpen(ticket)
  );
}

function eventForTicket({
  ticket,
  ruleKey,
  targetUserId,
  targetChannel,
  message,
  payload,
  repeatDaily = false
}: {
  ticket: Ticket;
  ruleKey: string;
  targetUserId: string | null;
  targetChannel: string | null;
  message: string;
  payload: Record<string, unknown>;
  repeatDaily?: boolean;
}): NewAutomationEvent {
  const today = new Date().toISOString().slice(0, 10);
  const suffix = repeatDaily ? `:${today}` : "";

  return {
    rule_key: ruleKey,
    module: "Tickets",
    record_id: ticket.ticket_id,
    target_user_id: targetUserId,
    target_channel: targetChannel,
    message,
    dedupe_key: `${ruleKey}:${ticket.ticket_id}${suffix}`,
    payload: {
      ticket_id: ticket.ticket_id,
      business_id: ticket.business_id,
      priority: ticket.priority,
      status: ticket.status,
      ...payload
    }
  };
}

export function buildTicketAutomationEvents({
  tickets,
  businesses,
  staffMembers,
  operationsManagerUserId
}: {
  tickets: Ticket[];
  businesses: Business[];
  staffMembers: StaffUser[];
  operationsManagerUserId?: string | null;
}) {
  const businessById = new Map(
    businesses.map((business) => [business.business_id, business])
  );
  const staffById = new Map(
    staffMembers.map((staffMember) => [staffMember.user_id, staffMember])
  );
  const events: NewAutomationEvent[] = [];

  for (const ticket of tickets) {
    const owner = assignee(ticket, staffById);
    const name = businessName(ticket, businessById);

    if (isOpen(ticket) && ticket.priority === "Critical") {
      events.push(
        eventForTicket({
          ticket,
          ruleKey: "ticket_high_critical_created",
          targetUserId: null,
          targetChannel: "crm_tickets",
          message: withSlackMentions(ticketOpenedSlackMessage({
            assignedTo: owner?.full_name ?? "Unassigned",
            businessName: name,
            businessOwner: ticket.business_id
              ? businessById.get(ticket.business_id)?.owner_name
              : null,
            category: ticket.issue_category,
            priority: ticket.priority,
            sla: ticket.sla_deadline,
            subCategory: ticket.sub_category,
            subject: ticket.subject,
            ticketId: ticket.ticket_id
          }), [owner?.slack_user_id]),
          payload: {
            business_name: name,
            issue_category: ticket.issue_category,
            sub_category: ticket.sub_category,
            sla_deadline: ticket.sla_deadline
          }
        })
      );
    }

    if (isOpen(ticket)) {
      events.push(
        eventForTicket({
          ticket,
          ruleKey: "ticket_assigned",
          targetUserId: owner?.user_id ?? null,
          targetChannel: "slack_dm",
          message: ticketAssignedSlackMessage({
            assignedTo: owner?.full_name,
            businessName: name,
            category: ticket.issue_category,
            priority: ticket.priority,
            sla: ticket.sla_deadline,
            subCategory: ticket.sub_category,
            subject: ticket.subject,
            ticketId: ticket.ticket_id
          }),
          payload: {
            business_name: name,
            assigned_to: owner?.full_name ?? null,
            sla_deadline: ticket.sla_deadline
          }
        })
      );
    }

    if (isHalfwayThroughSla(ticket)) {
      events.push(
        eventForTicket({
          ticket,
          ruleKey: "ticket_sla_halfway",
          targetUserId: owner?.user_id ?? null,
          targetChannel: "slack_dm",
          message: slackFieldTable("SLA REMINDER", [
            ["Ticket ID", ticket.ticket_id],
            ["Business Name", name],
            ["Subject", ticket.subject],
            ["Status", ticket.status],
            ["Priority", ticket.priority],
            ["Assigned to", owner?.full_name],
            ["SLA", ticket.sla_deadline],
            ["Action", "Update the ticket if you are working on it"]
          ]),
          payload: {
            business_name: name,
            assigned_to: owner?.full_name ?? null,
            sla_deadline: ticket.sla_deadline
          }
        })
      );
    }

    if (isSlaBreached(ticket)) {
      events.push(
        eventForTicket({
          ticket,
          ruleKey: "ticket_sla_breached",
          targetUserId: owner?.user_id ?? operationsManagerUserId ?? null,
          targetChannel: "slack_dm",
          message: slackFieldTable("SLA BREACHED", [
            ["Ticket ID", ticket.ticket_id],
            ["Business Name", name],
            ["Subject", ticket.subject],
            ["Priority", ticket.priority],
            ["Assigned to", owner?.full_name],
            ["Hours overdue", `${hoursOverdue(ticket)} hours`],
            ["Action", "Immediate attention needed"]
          ]),
          payload: {
            business_name: name,
            assigned_to: owner?.full_name ?? null,
            operations_manager_user_id: operationsManagerUserId ?? null,
            hours_overdue: hoursOverdue(ticket)
          },
          repeatDaily: true
        })
      );
    }

  }

  return events;
}
