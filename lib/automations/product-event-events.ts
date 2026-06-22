import type { NewAutomationEvent } from "@/lib/types/automation-events";
import type { ProductEvent } from "@/lib/types/product-events";
import type { StaffUser } from "@/lib/types/users";
import { slackFieldTable } from "@/lib/notifications/ticket-messages";

function posterName(event: ProductEvent, staffById: Map<string, StaffUser>) {
  return staffById.get(event.posted_by)?.full_name ?? "Unknown";
}

function eventForProductEvent({
  event,
  ruleKey,
  targetChannel,
  message,
  payload
}: {
  event: ProductEvent;
  ruleKey: string;
  targetChannel: string;
  message: string;
  payload: Record<string, unknown>;
}): NewAutomationEvent {
  return {
    rule_key: ruleKey,
    module: "Product Log",
    record_id: event.event_id,
    target_user_id: null,
    target_channel: targetChannel,
    message,
    dedupe_key: `${ruleKey}:${event.event_id}`,
    payload: {
      event_id: event.event_id,
      title: event.title,
      event_type: event.event_type,
      severity: event.severity,
      status: event.status,
      ...payload
    }
  };
}

export function buildProductEventAutomationEvents({
  productEvents,
  staffMembers
}: {
  productEvents: ProductEvent[];
  staffMembers: StaffUser[];
}) {
  const staffById = new Map(
    staffMembers.map((staffMember) => [staffMember.user_id, staffMember])
  );
  const events: NewAutomationEvent[] = [];

  for (const event of productEvents) {
    if (
      event.event_type === "Unplanned Outage" &&
      ["High", "Critical"].includes(event.severity ?? "")
    ) {
      events.push(
        eventForProductEvent({
          event,
          ruleKey: "product_outage_high_critical_reported",
          targetChannel: "crm_general",
          message: slackFieldTable("OUTAGE REPORTED", [
            ["Event ID", event.event_id],
            ["Title", event.title],
            ["Severity", event.severity],
            ["Affected", event.affected_products.join(", ")],
            ["Status", event.status],
            ["Posted by", posterName(event, staffById)],
            ["Description", event.description],
            ["Action", "Incoming complaints may be related"]
          ]),
          payload: {
            affected_products: event.affected_products,
            posted_by: posterName(event, staffById)
          }
        })
      );
    }

    if (event.status === "Resolved") {
      events.push(
        eventForProductEvent({
          event,
          ruleKey: "product_event_resolved",
          targetChannel: "crm_general",
          message: slackFieldTable("PRODUCT EVENT RESOLVED", [
            ["Event ID", event.event_id],
            ["Title", event.title],
            ["Severity", event.severity],
            ["Affected", event.affected_products.join(", ")],
            ["Resolved in", `${event.resolution_time_hours ?? "unknown"} hours`],
            ["Resolved at", event.resolved_at],
            ["Posted by", posterName(event, staffById)]
          ]),
          payload: {
            resolved_at: event.resolved_at,
            resolution_time_hours: event.resolution_time_hours,
            posted_by: posterName(event, staffById)
          }
        })
      );
    }
  }

  return events;
}
