export type ProductEventType =
  | "Feature Launch"
  | "Bug Fix"
  | "Scheduled Maintenance"
  | "Unplanned Outage"
  | "Product Update"
  | "Security Patch";

export type ProductArea = string;

export type Severity = "Info" | "Low" | "Medium" | "High" | "Critical";

export type ProductEventStatus = "Active" | "Monitoring" | "Resolved";

export type ProductEvent = {
  event_id: string;
  event_type: ProductEventType;
  title: string;
  description: string;
  affected_products: ProductArea[];
  severity: Severity | null;
  status: ProductEventStatus;
  posted_by: string;
  resolved_at: string | null;
  resolution_time_hours: number | null;
  created_at: string;
  updated_at: string;
};
