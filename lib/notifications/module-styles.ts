export type CrmNotificationModule =
  | "Dashboard"
  | "Leads"
  | "Businesses"
  | "Tickets"
  | "Partners"
  | "Product Log"
  | "Reports"
  | "Settings"
  | "Referrals";

type ModuleStyle = {
  color: string;
  emoji: string;
  label: string;
};

const fallbackStyle: ModuleStyle = {
  color: "#6B7280",
  emoji: "⚙️",
  label: "CRM"
};

const moduleStyles: Record<CrmNotificationModule, ModuleStyle> = {
  Dashboard: {
    color: "#3362B0",
    emoji: "📊",
    label: "DASHBOARD"
  },
  Leads: {
    color: "#3362B0",
    emoji: "📌",
    label: "LEAD"
  },
  Businesses: {
    color: "#16A34A",
    emoji: "🏢",
    label: "BUSINESS"
  },
  Tickets: {
    color: "#DC2626",
    emoji: "🎫",
    label: "TICKET"
  },
  Partners: {
    color: "#7C3AED",
    emoji: "🤝",
    label: "PARTNER"
  },
  "Product Log": {
    color: "#F97316",
    emoji: "🛠️",
    label: "PRODUCT LOG"
  },
  Reports: {
    color: "#0F766E",
    emoji: "📈",
    label: "REPORT"
  },
  Settings: {
    color: "#6B7280",
    emoji: "⚙️",
    label: "SETTINGS"
  },
  Referrals: {
    color: "#CA8A04",
    emoji: "🔁",
    label: "REFERRAL"
  }
};

export function notificationStyleForModule(module: string | null | undefined) {
  if (module && module in moduleStyles) {
    return moduleStyles[module as CrmNotificationModule];
  }

  return fallbackStyle;
}

export function formatSlackNotificationText({
  module,
  message,
  recordId
}: {
  module?: string | null;
  message: string;
  recordId?: string | null;
}) {
  const style = notificationStyleForModule(module);
  const heading = recordId
    ? `${style.emoji} *${style.label} | ${recordId}*`
    : `${style.emoji} *${style.label}*`;

  return `${heading}\n${message}`;
}
