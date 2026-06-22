import { getBusinessAttentionLists } from "@/lib/businesses/attention";
import type { AutomationSettingsInput } from "@/lib/types/automation-settings";
import type { NewAutomationEvent } from "@/lib/types/automation-events";
import type { Business } from "@/lib/types/businesses";
import type { StaffUser } from "@/lib/types/users";
import { formatNaira } from "@/lib/format/currency";
import { slackFieldTable } from "@/lib/notifications/ticket-messages";

function businessFields({
  action,
  business,
  owner,
  title
}: {
  action: string;
  business: Business;
  owner?: StaffUser | null;
  title: string;
}) {
  return slackFieldTable(title, [
    ["Business ID", business.business_id],
    ["Business Name", business.business_name],
    ["Owner", business.owner_name],
    ["CS owner", owner?.full_name],
    ["Lifecycle", business.lifecycle_stage],
    ["KYB status", business.kyb_status],
    ["Action", action]
  ]);
}

function assignedOwner(
  business: Business,
  staffById: Map<string, StaffUser>
) {
  return business.assigned_cs_owner
    ? staffById.get(business.assigned_cs_owner)
    : null;
}

function eventForBusiness({
  business,
  ruleKey,
  targetUserId,
  targetChannel,
  message,
  payload
}: {
  business: Business;
  ruleKey: string;
  targetUserId: string | null;
  targetChannel: string | null;
  message: string;
  payload: Record<string, unknown>;
}): NewAutomationEvent {
  const today = new Date().toISOString().slice(0, 10);

  return {
    rule_key: ruleKey,
    module: "Businesses",
    record_id: business.business_id,
    target_user_id: targetUserId,
    target_channel: targetChannel,
    message,
    dedupe_key: `${ruleKey}:${business.business_id}:${today}`,
    payload: {
      business_id: business.business_id,
      business_name: business.business_name,
      ...payload
    }
  };
}

export function buildBusinessAutomationEvents({
  businesses,
  settings,
  staffMembers,
  operationsManagerUserId
}: {
  businesses: Business[];
  settings: AutomationSettingsInput;
  staffMembers: StaffUser[];
  operationsManagerUserId?: string | null;
}) {
  const staffById = new Map(
    staffMembers.map((staffMember) => [staffMember.user_id, staffMember])
  );
  const attention = getBusinessAttentionLists(businesses, settings);
  const events: NewAutomationEvent[] = [];

  for (const business of attention.kybNotSubmitted48Hours) {
    const owner = assignedOwner(business, staffById);
    events.push(
      eventForBusiness({
        business,
        ruleKey: "business_kyb_not_submitted",
        targetUserId: owner?.user_id ?? null,
        targetChannel: "slack_dm",
        message: businessFields({
          action: `Follow up. KYB not submitted after ${settings.kyb_not_submitted_days}+ days`,
          business,
          owner,
          title: "BUSINESS KYB REMINDER"
        }),
        payload: {
          assigned_cs_owner: owner?.full_name ?? null,
          registration_date: business.registration_date
        }
      })
    );
  }

  for (const business of attention.noFirstTransaction7Days) {
    const owner = assignedOwner(business, staffById);
    events.push(
      eventForBusiness({
        business,
        ruleKey: "business_no_first_transaction_first_alert",
        targetUserId: owner?.user_id ?? null,
        targetChannel: "slack_dm",
        message: businessFields({
          action: `Follow up. No first transaction after ${settings.no_first_transaction_first_alert_days}+ days`,
          business,
          owner,
          title: "BUSINESS ACTIVATION REMINDER"
        }),
        payload: {
          assigned_cs_owner: owner?.full_name ?? null,
          kyb_approval_date: business.kyb_approval_date
        }
      })
    );
  }

  for (const business of attention.noFirstTransaction21Days) {
    const owner = assignedOwner(business, staffById);
    events.push(
      eventForBusiness({
        business,
        ruleKey: "business_no_first_transaction_at_risk",
        targetUserId: owner?.user_id ?? operationsManagerUserId ?? null,
        targetChannel: "slack_dm",
        message: businessFields({
          action: `Review for At Risk. No first transaction after ${settings.no_first_transaction_at_risk_days}+ days`,
          business,
          owner,
          title: "BUSINESS AT RISK REVIEW"
        }),
        payload: {
          assigned_cs_owner: owner?.full_name ?? null,
          operations_manager_user_id: operationsManagerUserId ?? null
        }
      })
    );
  }

  for (const business of attention.inactive30Days) {
    const owner = assignedOwner(business, staffById);
    events.push(
      eventForBusiness({
        business,
        ruleKey: "business_inactive_first_alert",
        targetUserId: owner?.user_id ?? null,
        targetChannel: "slack_dm",
        message: businessFields({
          action: `Re-engage. No transaction for ${settings.inactive_first_alert_days}+ days`,
          business,
          owner,
          title: "BUSINESS INACTIVITY"
        }),
        payload: {
          assigned_cs_owner: owner?.full_name ?? null,
          last_transaction_date: business.last_transaction_date
        }
      })
    );
  }

  for (const business of attention.inactive60Days) {
    const owner = assignedOwner(business, staffById);
    events.push(
      eventForBusiness({
        business,
        ruleKey: "business_inactive_second_alert",
        targetUserId: owner?.user_id ?? operationsManagerUserId ?? null,
        targetChannel: "slack_dm",
        message: businessFields({
          action: `Urgent follow-up. No transaction for ${settings.inactive_second_alert_days}+ days`,
          business,
          owner,
          title: "URGENT BUSINESS INACTIVITY"
        }),
        payload: {
          assigned_cs_owner: owner?.full_name ?? null,
          operations_manager_user_id: operationsManagerUserId ?? null
        }
      })
    );
  }

  for (const business of attention.inactive90Days) {
    events.push(
      eventForBusiness({
        business,
        ruleKey: "business_inactive_churn_review",
        targetUserId: operationsManagerUserId ?? null,
        targetChannel: "slack_dm",
        message: businessFields({
          action: `Review for Churned. No transaction for ${settings.inactive_churn_days}+ days`,
          business,
          owner: null,
          title: "BUSINESS CHURN REVIEW"
        }),
        payload: {
          operations_manager_user_id: operationsManagerUserId ?? null,
          last_transaction_date: business.last_transaction_date
        }
      })
    );
  }

  for (const business of attention.approachingTransactionLimit) {
    const owner = assignedOwner(business, staffById);
    events.push(
      eventForBusiness({
        business,
        ruleKey: "business_transaction_limit_warning",
        targetUserId: owner?.user_id ?? null,
        targetChannel: "slack_dm",
        message: slackFieldTable("TRANSACTION LIMIT WARNING", [
          ["Business ID", business.business_id],
          ["Business Name", business.business_name],
          ["CS owner", owner?.full_name],
          ["Current volume", formatNaira(business.current_transaction_volume)],
          ["Limit", formatNaira(business.transaction_limit_amount)],
          ["Indemnity form", business.indemnity_form_on_file ? "On file" : "Not on file"],
          ["Action", "Check if indemnity form is on file"]
        ]),
        payload: {
          assigned_cs_owner: owner?.full_name ?? null,
          current_transaction_volume: business.current_transaction_volume,
          transaction_limit_amount: business.transaction_limit_amount,
          indemnity_form_on_file: business.indemnity_form_on_file
        }
      })
    );
  }

  return events;
}
