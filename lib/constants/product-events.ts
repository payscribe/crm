import type {
  ProductArea,
  ProductEventStatus,
  ProductEventType,
  Severity
} from "@/lib/types/product-events";

export const productEventTypes: ProductEventType[] = [
  "Feature Launch",
  "Bug Fix",
  "Scheduled Maintenance",
  "Unplanned Outage",
  "Product Update",
  "Security Patch"
];

export const productAreas: ProductArea[] = [
  "Virtual NGN Accounts",
  "USD Virtual Cards",
  "Contactless Cards",
  "Stablecoin Payments",
  "API",
  "Dashboard",
  "Webhooks",
  "Settlement",
  "VTU",
  "Bills and Subscription",
  "Airtime",
  "Data",
  "Electricity",
  "Cable TV Subscription",
  "Betting Platform Funding",
  "All Products"
];

export const severities: Severity[] = [
  "Info",
  "Low",
  "Medium",
  "High",
  "Critical"
];

export const productEventStatuses: ProductEventStatus[] = [
  "Active",
  "Monitoring",
  "Resolved"
];

export const editableProductEventStatuses: ProductEventStatus[] =
  productEventStatuses.filter((status) => status !== "Resolved");
