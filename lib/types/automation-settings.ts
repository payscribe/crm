export type AutomationSettings = {
  settings_id: boolean;
  kyb_not_submitted_days: number;
  no_first_transaction_first_alert_days: number;
  no_first_transaction_at_risk_days: number;
  inactive_first_alert_days: number;
  inactive_second_alert_days: number;
  inactive_churn_days: number;
  transaction_limit_warning_percent: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type AutomationSettingsInput = Omit<
  AutomationSettings,
  "settings_id" | "updated_by" | "created_at" | "updated_at"
>;
