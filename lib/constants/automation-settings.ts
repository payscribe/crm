import type { AutomationSettingsInput } from "@/lib/types/automation-settings";

export const defaultAutomationSettings: AutomationSettingsInput = {
  kyb_not_submitted_days: 2,
  no_first_transaction_first_alert_days: 7,
  no_first_transaction_at_risk_days: 21,
  inactive_first_alert_days: 30,
  inactive_second_alert_days: 60,
  inactive_churn_days: 90,
  transaction_limit_warning_percent: 80
};
