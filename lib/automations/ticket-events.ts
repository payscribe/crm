import type { NewAutomationEvent } from "@/lib/types/automation-events";
import type { Business } from "@/lib/types/businesses";
import type { Ticket } from "@/lib/types/tickets";
import type { StaffUser } from "@/lib/types/users";

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
          message: `NEW TICKET ${ticket.ticket_id} - ${ticket.subject} - ${ticket.issue_category}${ticket.sub_category ? ` / ${ticket.sub_category}` : ""} - ${name} - Priority: ${ticket.priority} - SLA: ${ticket.sla_deadline ?? "Not set"}.`,
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
          message: `You have been assigned ${ticket.ticket_id}. Subject: ${ticket.subject}. Category: ${ticket.issue_category}${ticket.sub_category ? ` / ${ticket.sub_category}` : ""} for ${name}. Priority: ${ticket.priority}. SLA deadline: ${ticket.sla_deadline ?? "Not set"}.`,
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
          message: `Reminder: ${ticket.ticket_id} is halfway through its SLA window. Current status: ${ticket.status}. Update if you are working on it.`,
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
          message: `SLA BREACHED: ${ticket.ticket_id} - ${name} - Priority: ${ticket.priority} - ${hoursOverdue(ticket)} hours overdue. Immediate attention needed.`,
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
