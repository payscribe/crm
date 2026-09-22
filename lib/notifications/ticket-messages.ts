type SlackFieldValue = string | number | null | undefined;

const DEFAULT_SLACK_VALUE_LIMIT = 700;

function cleanValue(value: SlackFieldValue, maxLength = DEFAULT_SLACK_VALUE_LIMIT) {
  const text = String(value ?? "Not set").trim();
  const cleaned = text.length > 0
    ? text.replace(/```/g, "'''").replace(/\n{3,}/g, "\n\n")
    : "Not set";

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  return `${cleaned.slice(0, maxLength - 3).trim()}...`;
}

export function formatDateForSlack(dateString: SlackFieldValue) {
  if (!dateString) {
    return "Not set";
  }
  
  try {
    const date = new Date(String(dateString));
    if (isNaN(date.getTime())) {
      return "Invalid date";
    }
    
    // Format: "Mon, Jun 29, 2026 3:45 PM"
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    });
  } catch {
    return "Invalid date";
  }
}

export function slackFieldTable(
  title: string,
  fields: Array<[label: string, value: SlackFieldValue]>
) {
  const rows = fields
    .map(([label, value]) => `• *${label}:* ${cleanValue(value)}`)
    .join("\n");

  return `*${title}*\n${rows}`;
}

export function slackUserMention(slackUserId: string | null | undefined) {
  const cleanId = String(slackUserId ?? "").trim();
  return cleanId ? `<@${cleanId}>` : null;
}

export function withSlackMentions(
  message: string,
  slackUserIds: Array<string | null | undefined>
) {
  const mentions = Array.from(
    new Set(slackUserIds.map(slackUserMention).filter(Boolean))
  );

  if (mentions.length === 0) {
    return message;
  }

  return `Mentions: ${mentions.join(" ")}\n${message}`;
}

export function ticketOpenedSlackMessage({
  assignedTo,
  businessName,
  businessOwner,
  category,
  description,
  priority,
  sla,
  subCategory,
  subject,
  ticketId
}: {
  assignedTo?: SlackFieldValue;
  businessName?: SlackFieldValue;
  businessOwner?: SlackFieldValue;
  category?: SlackFieldValue;
  description?: SlackFieldValue;
  priority?: SlackFieldValue;
  sla?: SlackFieldValue;
  subCategory?: SlackFieldValue;
  subject?: SlackFieldValue;
  ticketId: string;
}) {
  return slackFieldTable("NEW TICKET", [
    ["Ticket ID", ticketId],
    ["Business Name", businessName],
    ["Business Owner", businessOwner],
    ["Subject", subject],
    ["Description", description],
    ["Category", category],
    ["Sub category", subCategory],
    ["Priority", priority],
    ["Assigned to", assignedTo],
    ["SLA Deadline", formatDateForSlack(sla)]
  ]);
}

export function ticketAssignedSlackMessage({
  assignedTo,
  businessName,
  category,
  description,
  priority,
  sla,
  subCategory,
  subject,
  ticketId
}: {
  assignedTo?: SlackFieldValue;
  businessName?: SlackFieldValue;
  category?: SlackFieldValue;
  description?: SlackFieldValue;
  priority?: SlackFieldValue;
  sla?: SlackFieldValue;
  subCategory?: SlackFieldValue;
  subject?: SlackFieldValue;
  ticketId: string;
}) {
  return slackFieldTable("TICKET ASSIGNED", [
    ["Ticket ID", ticketId],
    ["Business Name", businessName],
    ["Subject", subject],
    ["Description", description],
    ["Category", category],
    ["Sub category", subCategory],
    ["Priority", priority],
    ["Assigned to", assignedTo],
    ["SLA Deadline", formatDateForSlack(sla)]
  ]);
}

export function ticketClosedSlackMessage({
  closedBy,
  resolution,
  ticketId
}: {
  closedBy: string;
  resolution: string;
  ticketId: string;
}) {
  return slackFieldTable("TICKET CLOSED", [
    ["Ticket ID", ticketId],
    ["Resolution", resolution],
    ["Closed By", closedBy]
  ]);
}

export function ticketNoteSlackMessage({
  addedBy,
  note,
  subject,
  ticketId
}: {
  addedBy: string;
  note: string;
  subject: string;
  ticketId: string;
}) {
  return slackFieldTable("TICKET NOTE", [
    ["Ticket ID", ticketId],
    ["Subject", subject],
    ["Added by", addedBy],
    ["Note", note]
  ]);
}

export function ticketCustomerReplySlackMessage({
  customerName,
  message,
  subject,
  ticketId
}: {
  customerName: string;
  message: string;
  subject: string;
  ticketId: string;
}) {
  return slackFieldTable("CUSTOMER REPLY", [
    ["Ticket ID", ticketId],
    ["Subject", subject],
    ["From", customerName],
    ["Message", message]
  ]);
}
