import type { NewAutomationEvent } from "@/lib/types/automation-events";
import type { Partner } from "@/lib/types/partners";
import type { StaffUser } from "@/lib/types/users";
import {
  slackFieldTable,
  withSlackMentions
} from "@/lib/notifications/ticket-messages";

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function daysSince(value: string | null) {
  if (!value) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);

  return Math.floor((today.getTime() - date.getTime()) / 86400000);
}

function isTodayOrPast(value: string | null) {
  const days = daysSince(value);
  return days !== null && days >= 0;
}

function owner(partner: Partner, staffById: Map<string, StaffUser>) {
  return partner.payscribe_contact
    ? staffById.get(partner.payscribe_contact)
    : null;
}

function eventForPartner({
  partner,
  ruleKey,
  targetUserId,
  targetChannel,
  message,
  payload,
  repeatDaily = false
}: {
  partner: Partner;
  ruleKey: string;
  targetUserId: string | null;
  targetChannel: string | null;
  message: string;
  payload: Record<string, unknown>;
  repeatDaily?: boolean;
}): NewAutomationEvent {
  const suffix = repeatDaily ? `:${todayString()}` : "";

  return {
    rule_key: ruleKey,
    module: "Partners",
    record_id: partner.partner_id,
    target_user_id: targetUserId,
    target_channel: targetChannel,
    message,
    dedupe_key: `${ruleKey}:${partner.partner_id}${suffix}`,
    payload: {
      partner_id: partner.partner_id,
      organisation_name: partner.organisation_name,
      outreach_status: partner.outreach_status,
      priority: partner.priority,
      ...payload
    }
  };
}

export function buildPartnerAutomationEvents({
  partners,
  staffMembers,
  operationsManagerUserId
}: {
  partners: Partner[];
  staffMembers: StaffUser[];
  operationsManagerUserId?: string | null;
}) {
  const staffById = new Map(
    staffMembers.map((staffMember) => [staffMember.user_id, staffMember])
  );
  const events: NewAutomationEvent[] = [];

  for (const partner of partners) {
    const contact = owner(partner, staffById);

    if (
      partner.outreach_status === "Outreach Sent" &&
      (daysSince(partner.date_first_contacted) ?? 0) >= 7
    ) {
      events.push(
        eventForPartner({
          partner,
          ruleKey: "partner_outreach_no_response_7_days",
          targetUserId: contact?.user_id ?? null,
          targetChannel: "slack_dm",
          message: slackFieldTable("PARTNER FOLLOW-UP", [
            ["Partner ID", partner.partner_id],
            ["Organisation", partner.organisation_name],
            ["Status", partner.outreach_status],
            ["Owner", contact?.full_name],
            ["First contacted", partner.date_first_contacted],
            ["Action", "No response after 7 days. Follow up or update status"]
          ]),
          payload: {
            payscribe_contact: contact?.full_name ?? null,
            date_first_contacted: partner.date_first_contacted
          },
          repeatDaily: true
        })
      );
    }

    if (partner.would_revisit && isTodayOrPast(partner.next_review_date)) {
      events.push(
        eventForPartner({
          partner,
          ruleKey: "partner_review_due",
          targetUserId: contact?.user_id ?? operationsManagerUserId ?? null,
          targetChannel: "slack_dm",
          message: slackFieldTable("PARTNER REVIEW DUE", [
            ["Partner ID", partner.partner_id],
            ["Organisation", partner.organisation_name],
            ["Owner", contact?.full_name],
            ["Review date", partner.next_review_date],
            ["Original outcome", partner.outcome_reason ?? "Not recorded"],
            ["Action", "Check if conditions have changed"]
          ]),
          payload: {
            payscribe_contact: contact?.full_name ?? null,
            operations_manager_user_id: operationsManagerUserId ?? null,
            next_review_date: partner.next_review_date,
            outcome_reason: partner.outcome_reason
          },
          repeatDaily: true
        })
      );
    }

    if (partner.outreach_status === "Active Partner") {
      events.push(
        eventForPartner({
          partner,
          ruleKey: "partner_active",
          targetUserId: null,
          targetChannel: "crm_general",
          message: withSlackMentions(slackFieldTable("NEW ACTIVE PARTNER", [
            ["Partner ID", partner.partner_id],
            ["Organisation", partner.organisation_name],
            ["Type", partner.partner_type],
            ["Owner", contact?.full_name ?? "Unassigned"],
            ["Country", partner.country],
            ["Status", partner.outreach_status]
          ]), [contact?.slack_user_id]),
          payload: {
            partner_type: partner.partner_type,
            payscribe_contact: contact?.full_name ?? null
          }
        })
      );
    }

    if (
      partner.priority === "Critical" &&
      partner.outreach_status === "Identified" &&
      (daysSince(partner.created_at) ?? 0) >= 14
    ) {
      events.push(
        eventForPartner({
          partner,
          ruleKey: "partner_critical_not_contacted_14_days",
          targetUserId: operationsManagerUserId ?? null,
          targetChannel: "slack_dm",
          message: slackFieldTable("CRITICAL PARTNER NOT CONTACTED", [
            ["Partner ID", partner.partner_id],
            ["Organisation", partner.organisation_name],
            ["Priority", partner.priority],
            ["Status", partner.outreach_status],
            ["Created", partner.created_at],
            ["Action", "Critical priority but not contacted after 14 days"]
          ]),
          payload: {
            operations_manager_user_id: operationsManagerUserId ?? null,
            created_at: partner.created_at
          },
          repeatDaily: true
        })
      );
    }
  }

  return events;
}
