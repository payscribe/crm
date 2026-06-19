import type { Business } from "@/lib/types/businesses";
import { defaultAutomationSettings } from "@/lib/constants/automation-settings";
import type { AutomationSettingsInput } from "@/lib/types/automation-settings";

const dayInMilliseconds = 1000 * 60 * 60 * 24;

export function daysBetweenToday(value: string | null) {
  if (!value) {
    return null;
  }

  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / dayInMilliseconds));
}

export function getBusinessAttentionLists(
  businesses: Business[],
  settings: AutomationSettingsInput = defaultAutomationSettings
) {
  const kybNotSubmitted48Hours = businesses.filter((business) => {
    const daysSinceRegistration = daysBetweenToday(business.registration_date);
    return (
      business.kyb_status === "Not Submitted" &&
      daysSinceRegistration !== null &&
      daysSinceRegistration >= settings.kyb_not_submitted_days
    );
  });

  const noFirstTransaction7Days = businesses.filter((business) => {
    const daysSinceKybApproval = daysBetweenToday(business.kyb_approval_date);
    return (
      business.kyb_status === "Approved" &&
      !business.last_transaction_date &&
      daysSinceKybApproval !== null &&
      daysSinceKybApproval >= settings.no_first_transaction_first_alert_days
    );
  });

  const noFirstTransaction21Days = businesses.filter((business) => {
    const daysSinceKybApproval = daysBetweenToday(business.kyb_approval_date);
    return (
      business.kyb_status === "Approved" &&
      !business.last_transaction_date &&
      daysSinceKybApproval !== null &&
      daysSinceKybApproval >= settings.no_first_transaction_at_risk_days
    );
  });

  const inactive30Days = businesses.filter((business) => {
    const daysSinceTransaction = daysBetweenToday(business.last_transaction_date);
    return (
      business.lifecycle_stage === "Active" &&
      daysSinceTransaction !== null &&
      daysSinceTransaction >= settings.inactive_first_alert_days
    );
  });

  const inactive60Days = businesses.filter((business) => {
    const daysSinceTransaction = daysBetweenToday(business.last_transaction_date);
    return (
      business.lifecycle_stage === "Active" &&
      daysSinceTransaction !== null &&
      daysSinceTransaction >= settings.inactive_second_alert_days
    );
  });

  const inactive90Days = businesses.filter((business) => {
    const daysSinceTransaction = daysBetweenToday(business.last_transaction_date);
    return (
      business.lifecycle_stage === "Active" &&
      daysSinceTransaction !== null &&
      daysSinceTransaction >= settings.inactive_churn_days
    );
  });

  const atRiskBusinesses = businesses.filter(
    (business) => business.lifecycle_stage === "At Risk"
  );

  const needsReassignment = businesses.filter(
    (business) => business.needs_reassignment
  );

  const approachingTransactionLimit = businesses.filter((business) => {
    if (!business.transaction_limit_amount || business.transaction_limit_amount <= 0) {
      return false;
    }

    return (
      business.current_transaction_volume >=
      business.transaction_limit_amount *
        (settings.transaction_limit_warning_percent / 100)
    );
  });

  return {
    kybNotSubmitted48Hours,
    noFirstTransaction7Days,
    noFirstTransaction21Days,
    inactive30Days,
    inactive60Days,
    inactive90Days,
    atRiskBusinesses,
    needsReassignment,
    approachingTransactionLimit
  };
}
