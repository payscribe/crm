import type {
  BusinessLifecycleStage,
  BusinessProduct,
  IntegrationType,
  KybStatus,
  MonthlyVolumeRange,
  SettlementType
} from "@/lib/types/businesses";

export const businessLifecycleStages: BusinessLifecycleStage[] = [
  "Registered",
  "KYB Pending",
  "KYB Approved",
  "First Transaction",
  "Active",
  "At Risk",
  "Suspended",
  "Churned"
];

export const kybStatuses: KybStatus[] = [
  "Not Submitted",
  "Submitted",
  "Approved",
  "Rejected",
  "Resubmitted"
];

export const businessProducts: BusinessProduct[] = [
  "Virtual NGN Accounts",
  "USD Virtual Cards",
  "Contactless Cards",
  "Stablecoin Payments",
  "API Integration",
  "White-label Infrastructure",
  "Payment Links",
  "Bank Settlement",
  "VTU",
  "Bills and Subscription",
  "Airtime",
  "Data",
  "Electricity",
  "Cable TV Subscription",
  "Betting Platform Funding"
];

export const integrationTypes: IntegrationType[] = [
  "Dashboard Only",
  "API Web",
  "API Mobile App",
  "White-label"
];

export const monthlyVolumeRanges: MonthlyVolumeRange[] = [
  "None",
  "Under 100k",
  "100k to 500k",
  "500k to 2M",
  "Above 2M"
];

export const settlementTypes: SettlementType[] = [
  "Instant",
  "9pm",
  "Bank Settlement"
];
