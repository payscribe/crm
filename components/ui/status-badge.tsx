type BadgeTone =
  | "blue"
  | "green"
  | "red"
  | "amber"
  | "purple"
  | "slate"
  | "neutral";

const toneClasses: Record<BadgeTone, string> = {
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  blue: "border-blue-200 bg-blue-50 text-blue-800",
  green: "border-emerald-200 bg-emerald-50 text-emerald-800",
  neutral: "border-neutral-200 bg-neutral-50 text-neutral-700",
  purple: "border-purple-200 bg-purple-50 text-purple-800",
  red: "border-red-200 bg-red-50 text-red-800",
  slate: "border-slate-200 bg-slate-50 text-slate-800"
};

export function StatusBadge({
  label,
  tone = "neutral"
}: {
  label: string;
  tone?: BadgeTone;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${toneClasses[tone]}`}
    >
      {label}
    </span>
  );
}

export function ticketStatusLabel(status: string) {
  return status === "Closed" ? "Resolved" : "Pending";
}

export function ticketStatusTone(status: string): BadgeTone {
  return status === "Closed" ? "green" : "amber";
}

export function ticketPriorityTone(priority: string): BadgeTone {
  if (priority === "Critical") return "red";
  if (priority === "Medium") return "amber";
  return "slate";
}

export function leadStatusTone(status: string): BadgeTone {
  if (status === "Hot") return "red";
  if (status === "Warm") return "amber";
  if (status === "Cold") return "blue";
  if (status === "On Hold") return "purple";
  if (status === "Closed Won") return "green";
  if (status === "Closed Lost") return "slate";
  return "neutral";
}

export function leadStageTone(stage: string): BadgeTone {
  if (["New", "Contacted", "Engaged"].includes(stage)) return "blue";
  if (["Qualified", "Demo Scheduled", "Onboarding"].includes(stage)) return "purple";
  if (stage === "Converted") return "green";
  if (stage === "Closed Lost") return "slate";
  return "neutral";
}

export function leadPriorityTone(priority: string): BadgeTone {
  if (priority === "Critical") return "red";
  if (priority === "High") return "amber";
  if (priority === "Medium") return "blue";
  return "slate";
}
