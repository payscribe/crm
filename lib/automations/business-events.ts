import { getBusinessAttentionLists } from "@/lib/businesses/attention";
import type { AutomationSettingsInput } from "@/lib/types/automation-settings";
import type { NewAutomationEvent } from "@/lib/types/automation-events";
import type { Business } from "@/lib/types/businesses";
import type { StaffUser } from "@/lib/types/users";

function businessLabel(business: Business) {
  return `${business.business_id} - ${business.business_name}`;
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
        message: `${businessLabel(business)} registered ${settings.kyb_not_submitted_days}+ days ago but has not submitted KYB documents.`,
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
        message: `${businessLabel(business)} KYB approved ${settings.no_first_transaction_first_alert_days}+ days ago with no first transaction. Follow up.`,
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
        message: `${businessLabel(business)} KYB approved ${settings.no_first_transaction_at_risk_days}+ days ago with no first transaction. Review for At Risk stage.`,
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
        message: `${businessLabel(business)} has had no transaction for ${settings.inactive_first_alert_days}+ days. Re-engagement needed.`,
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
        message: `URGENT: ${businessLabel(business)} has had no transaction for ${settings.inactive_second_alert_days}+ days.`,
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
        message: `${businessLabel(business)} has had no transaction for ${settings.inactive_churn_days}+ days. Review for Churned stage.`,
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
        message: `${businessLabel(business)} is approaching their transaction limit. Check if indemnity form is on file.`,
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
