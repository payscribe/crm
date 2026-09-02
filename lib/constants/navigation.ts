import type { CrmModule } from "@/lib/types/permissions";

export type NavigationItem = {
  label: string;
  href: string;
  module: CrmModule | "Dashboard" | "Issues";
};

export const navigationItems: NavigationItem[] = [
  { label: "Dashboard", href: "/", module: "Dashboard" },
  { label: "My Tasks", href: "/tasks", module: "Dashboard" },
  { label: "Leads", href: "/leads", module: "Leads" },
  { label: "Businesses", href: "/businesses", module: "Businesses" },
  { label: "Tickets", href: "/tickets", module: "Tickets" },
  { label: "Partners", href: "/partners", module: "Partners" },
  { label: "Product Log", href: "/product-log", module: "Product Log" },
  { label: "Issues", href: "/issues", module: "Issues" },
  { label: "Reports", href: "/reports", module: "Reports" },
  { label: "Settings", href: "/settings", module: "Settings" }
];
