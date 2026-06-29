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

type NotificationKind = {
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

function notificationKindForMessage(message: string): NotificationKind {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("reminder") ||
    normalized.includes("follow-up due") ||
    normalized.includes("follow up") ||
    normalized.includes("review due") ||
    normalized.includes("halfway") ||
    normalized.includes("due today") ||
    normalized.includes("overdue")
  ) {
    return {
      emoji: "⏰",
      label: "REMINDER"
    };
  }

  if (
    normalized.includes("sla breached") ||
    normalized.includes("breached") ||
    normalized.includes("urgent") ||
    normalized.includes("at risk") ||
    normalized.includes("churned") ||
    normalized.includes("critical priority")
  ) {
    return {
      emoji: "🚨",
      label: "ESCALATION"
    };
  }

  if (
    normalized.includes("resolved") ||
    normalized.includes("closed") ||
    normalized.includes("ticket closed")
  ) {
    return {
      emoji: "✅",
      label: "RESOLVED"
    };
  }

  if (
    normalized.includes("new note") ||
    normalized.includes("communication") ||
    normalized.includes("status changed") ||
    normalized.includes("stage changed") ||
    normalized.includes("assigned") ||
    normalized.includes("link")
  ) {
    return {
      emoji: "📝",
      label: "UPDATE"
    };
  }

  if (
    normalized.includes("new ticket") ||
    normalized.includes("new lead") ||
    normalized.includes("new active") ||
    normalized.includes("hot lead") ||
    normalized.includes("outage reported")
  ) {
    return {
      emoji: "✨",
      label: "NEW"
    };
  }

  return {
    emoji: "ℹ️",
    label: "NOTICE"
  };
}

export function formatSlackNotificationHeading({
  message,
  module,
  recordId
}: {
  message?: string | null;
  module?: string | null;
  recordId?: string | null;
}) {
  const style = notificationStyleForModule(module);
  const kind = notificationKindForMessage(message ?? "");
  const moduleLabel = `${style.emoji} ${style.label}`;

  return recordId
    ? `*${kind.emoji} ${kind.label} | ${moduleLabel} | ${recordId}*`
    : `*${kind.emoji} ${kind.label} | ${moduleLabel}*`;
}
