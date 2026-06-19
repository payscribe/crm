export type AutomationEventStatus = "Pending" | "Sent" | "Skipped" | "Failed";

export type AutomationEvent = {
  event_id: string;
  rule_key: string;
  module: string;
  record_id: string;
  target_user_id: string | null;
  target_channel: string | null;
  message: string;
  status: AutomationEventStatus;
  dedupe_key: string;
  payload: Record<string, unknown>;
  processed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type NewAutomationEvent = {
  rule_key: string;
  module: string;
  record_id: string;
  target_user_id: string | null;
  target_channel: string | null;
  message: string;
  dedupe_key: string;
  payload: Record<string, unknown>;
};
