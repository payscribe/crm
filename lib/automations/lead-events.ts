import type { NewAutomationEvent } from "@/lib/types/automation-events";
import type { Lead } from "@/lib/types/leads";
import type { StaffUser } from "@/lib/types/users";

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function leadLabel(lead: Lead) {
  return `${lead.lead_id} - ${lead.full_name}`;
}

function assignedOwner(lead: Lead, staffById: Map<string, StaffUser>) {
  return staffById.get(lead.assigned_to) ?? null;
}

function eventForLead({
  lead,
  ruleKey,
  targetUserId,
  targetChannel,
  message,
  payload
}: {
  lead: Lead;
  ruleKey: string;
  targetUserId: string | null;
  targetChannel: string | null;
  message: string;
  payload: Record<string, unknown>;
}): NewAutomationEvent {
  const today = todayString();

  return {
    rule_key: ruleKey,
    module: "Leads",
    record_id: lead.lead_id,
    target_user_id: targetUserId,
    target_channel: targetChannel,
    message,
    dedupe_key: `${ruleKey}:${lead.lead_id}:${today}`,
    payload: {
      lead_id: lead.lead_id,
      full_name: lead.full_name,
      business_name: lead.business_name,
      ...payload
    }
  };
}

function isFollowUpDue(lead: Lead) {
  if (lead.status === "Closed Won" || lead.status === "Closed Lost") {
    return false;
  }

  const followUpDate = new Date(lead.next_followup_date);

  return (
    followUpDate.getTime() <= startOfToday().getTime() &&
    lead.last_contact_date !== todayString()
  );
}

function hasBeenNewWithoutContactFor48Hours(lead: Lead) {
  const fortyEightHours = 48 * 60 * 60 * 1000;

  return (
    lead.stage === "New" &&
    !lead.last_contact_date &&
    Date.now() - new Date(lead.created_at).getTime() >= fortyEightHours
  );
}

export function buildLeadAutomationEvents({
  leads,
  staffMembers
}: {
  leads: Lead[];
  staffMembers: StaffUser[];
}) {
  const staffById = new Map(
    staffMembers.map((staffMember) => [staffMember.user_id, staffMember])
  );
  const events: NewAutomationEvent[] = [];

  for (const lead of leads) {
    const owner = assignedOwner(lead, staffById);

    if (isFollowUpDue(lead)) {
      events.push(
        eventForLead({
          lead,
          ruleKey: "lead_follow_up_due",
          targetUserId: owner?.user_id ?? null,
          targetChannel: "slack_dm",
          message: `Follow-up due: ${lead.lead_id} - ${lead.full_name} - ${lead.business_name ?? "No business name"} - Status: ${lead.status} - Last contact: ${lead.last_contact_date ?? "No contact logged"}.`,
          payload: {
            assigned_to: owner?.full_name ?? null,
            next_followup_date: lead.next_followup_date,
            last_contact_date: lead.last_contact_date
          }
        })
      );
    }

    if (lead.status === "Hot") {
      events.push(
        eventForLead({
          lead,
          ruleKey: "lead_status_hot",
          targetUserId: null,
          targetChannel: "crm_leads",
          message: `Hot lead: ${lead.lead_id} - ${lead.full_name} - ${lead.business_name ?? "No business name"} - Product interest: ${lead.product_interest.join(", ")} - Assigned to: ${owner?.full_name ?? "Unassigned"}.`,
          payload: {
            assigned_to: owner?.full_name ?? null,
            product_interest: lead.product_interest
          }
        })
      );
    }

    if (hasBeenNewWithoutContactFor48Hours(lead)) {
      events.push(
        eventForLead({
          lead,
          ruleKey: "lead_new_stage_no_contact_48h",
          targetUserId: owner?.user_id ?? null,
          targetChannel: "slack_dm",
          message: `${leadLabel(lead)} has been in New stage for 48 hours with no contact logged. Update the stage or log a communication.`,
          payload: {
            assigned_to: owner?.full_name ?? null,
            created_at: lead.created_at
          }
        })
      );
    }
  }

  return events;
}
