type SlackFieldValue = string | number | null | undefined;

function cleanValue(value: SlackFieldValue) {
  const text = String(value ?? "Not set").trim();
  return text.length > 0 ? text.replace(/```/g, "'''") : "Not set";
}

export function slackFieldTable(
  title: string,
  fields: Array<[label: string, value: SlackFieldValue]>
) {
  const labelWidth = Math.max(
    14,
    ...fields.map(([label]) => label.length)
  );
  const rows = fields
    .map(([label, value]) => `${label.padEnd(labelWidth)}  ${cleanValue(value)}`)
    .join("\n");

  return `*${title}*\n\`\`\`\n${rows}\n\`\`\``;
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
    ["Category", category],
    ["Sub category", subCategory],
    ["Priority", priority],
    ["Assigned to", assignedTo],
    ["SLA", sla]
  ]);
}

export function ticketAssignedSlackMessage({
  assignedTo,
  businessName,
  category,
  priority,
  sla,
  subCategory,
  subject,
  ticketId
}: {
  assignedTo?: SlackFieldValue;
  businessName?: SlackFieldValue;
  category?: SlackFieldValue;
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
    ["Category", category],
    ["Sub category", subCategory],
    ["Priority", priority],
    ["Assigned to", assignedTo],
    ["SLA", sla]
  ]);
}

export function ticketClosedSlackMessage({
  resolution,
  ticketId
}: {
  resolution: string;
  ticketId: string;
}) {
  return slackFieldTable("TICKET CLOSED", [
    ["Ticket ID", ticketId],
    ["Resolution", resolution]
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
