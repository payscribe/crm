import type { CrmModule } from "@/lib/types/permissions";

export type NavigationItem = {
  label: string;
  href: string;
  module: CrmModule | "Dashboard";
};

export const navigationItems: NavigationItem[] = [
  { label: "Dashboard", href: "/", module: "Dashboard" },
  { label: "Leads", href: "/leads", module: "Leads" },
  { label: "Businesses", href: "/businesses", module: "Businesses" },
  { label: "Tickets", href: "/tickets", module: "Tickets" },
  { label: "Partners", href: "/partners", module: "Partners" },
  { label: "Product Log", href: "/product-log", module: "Product Log" },
  { label: "Reports", href: "/reports", module: "Reports" },
  { label: "Settings", href: "/settings", module: "Settings" }
];
