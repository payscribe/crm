export type KybStatus =
  | "Not Submitted"
  | "Submitted"
  | "Approved"
  | "Rejected"
  | "Resubmitted";

export type BusinessLifecycleStage =
  | "Registered"
  | "KYB Pending"
  | "KYB Approved"
  | "First Transaction"
  | "Active"
  | "At Risk"
  | "Suspended"
  | "Churned";

export type BusinessProduct =
  | "Virtual NGN Accounts"
  | "USD Virtual Cards"
  | "Contactless Cards"
  | "Stablecoin Payments"
  | "API Integration"
  | "White-label Infrastructure"
  | "Payment Links"
  | "Bank Settlement"
  | "VTU"
  | "Bills and Subscription"
  | "Airtime"
  | "Data"
  | "Electricity"
  | "Cable TV Subscription"
  | "Betting Platform Funding";

export type IntegrationType =
  | "Dashboard Only"
  | "API Web"
  | "API Mobile App"
  | "White-label";

export type MonthlyVolumeRange =
  | "None"
  | "Under 100k"
  | "100k to 500k"
  | "500k to 2M"
  | "Above 2M";

export type SettlementType = "Instant" | "9pm" | "Bank Settlement";

export type Business = {
  business_id: string;
  business_name: string;
  owner_name: string | null;
  email: string;
  phone: string | null;
  registration_date: string | null;
  cac_rc_number: string | null;
  kyb_status: KybStatus;
  kyb_submission_date: string | null;
  kyb_approval_date: string | null;
  lifecycle_stage: BusinessLifecycleStage;
  products_active: BusinessProduct[] | null;
  integration_type: IntegrationType | null;
  monthly_volume_range: MonthlyVolumeRange | null;
  last_transaction_date: string | null;
  settlement_type: SettlementType | null;
  assigned_cs_owner: string | null;
  referral_code: string | null;
  referred_by_business_id: string | null;
  converted_lead_id: string | null;
  transaction_limit_amount: number | null;
  current_transaction_volume: number;
  indemnity_form_on_file: boolean;
  needs_reassignment: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
