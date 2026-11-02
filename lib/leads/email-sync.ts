import {
  activeStaffMembers,
  postLeadSlackThreadReply
} from "@/lib/leads/slack-thread";
import {
  formatDateForSlack,
  slackFieldTable,
  withSlackMentions
} from "@/lib/notifications/ticket-messages";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { LeadCommunicationDirection } from "@/lib/types/leads";

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

export const MAX_SYNCED_MESSAGES_PER_REQUEST = 100;
const SUMMARY_PREVIEW_LENGTH = 500;
const SLACK_PREVIEW_LENGTH = 300;
const MAX_EMAILS_PER_SLACK_POST = 5;

export type SyncedEmail = {
  messageId: string;
  gmailMessageId: string | null;
  threadId: string | null;
  from: string;
  to: string;
  cc: string;
  subject: string;
  date: string;
  body: string;
  // False for history imports, which are logged without posting to Slack.
  notify: boolean;
};

export type CompletedBackfill = {
  leadId: string;
  email: string;
};

type LeadEmailRow = {
  lead_id: string;
  email: string | null;
  assigned_to: string;
  email_history_synced_for: string | null;
};

type InsertedLogRow = {
  log_id: string;
  lead_id: string;
  date: string;
  direction: LeadCommunicationDirection;
  email_message_id: string;
  email_subject: string | null;
  email_from: string | null;
  email_to: string | null;
};

const emailAddressPattern = /[^\s<>,;:"'()[\]]+@[^\s<>,;:"'()[\]]+\.[^\s<>,;:"'()[\]]+/g;

export function normalizeEmail(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

export function extractEmailAddresses(header: string) {
  return Array.from(
    new Set((header.match(emailAddressPattern) ?? []).map(normalizeEmail))
  );
}

function truncate(text: string, maxLength: number) {
  return text.length > maxLength
    ? `${text.slice(0, maxLength - 3).trim()}...`
    : text;
}

// Keeps the new part of a reply: drops quoted lines and everything from the
// "On <date>, <name> wrote:" marker that introduces the quoted thread.
export function emailPreview(body: string, maxLength = SUMMARY_PREVIEW_LENGTH) {
  const lines: string[] = [];
  for (const line of body.replace(/\r\n/g, "\n").split("\n")) {
    if (/^On .+wrote:\s*$/i.test(line.trim()) ||
        /^-{2,}\s*Original Message\s*-{2,}/i.test(line.trim()) ||
        /^From: .+/i.test(line.trim()) && lines.length > 0) {
      break;
    }
    if (!line.trim().startsWith(">")) {
      lines.push(line);
    }
  }
  return truncate(lines.join("\n").replace(/\n{3,}/g, "\n\n").trim(), maxLength);
}

function cleanText(value: unknown, maxLength: number) {
  return truncate(String(value ?? "").trim(), maxLength);
}

export function parseSyncPayload(payload: unknown) {
  const body = (payload ?? {}) as {
    messages?: unknown;
    completedBackfills?: unknown;
  };
  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  const rawBackfills = Array.isArray(body.completedBackfills)
    ? body.completedBackfills
    : [];

  if (rawMessages.length > MAX_SYNCED_MESSAGES_PER_REQUEST) {
    return { error: `Send at most ${MAX_SYNCED_MESSAGES_PER_REQUEST} messages per request` } as const;
  }

  const messages: SyncedEmail[] = [];
  for (const raw of rawMessages) {
    const message = (raw ?? {}) as Record<string, unknown>;
    const messageId = cleanText(message.messageId, 500);
    const date = new Date(String(message.date ?? ""));
    if (!messageId || isNaN(date.getTime())) {
      continue;
    }
    messages.push({
      messageId,
      gmailMessageId: cleanText(message.gmailMessageId, 200) || null,
      threadId: cleanText(message.threadId, 200) || null,
      from: cleanText(message.from, 1000),
      to: cleanText(message.to, 2000),
      cc: cleanText(message.cc, 2000),
      subject: cleanText(message.subject, 500) || "(no subject)",
      date: date.toISOString(),
      body: cleanText(message.body, 20000),
      notify: message.notify !== false
    });
  }

  const completedBackfills: CompletedBackfill[] = [];
  for (const raw of rawBackfills) {
    const backfill = (raw ?? {}) as Record<string, unknown>;
    const leadId = cleanText(backfill.leadId, 80);
    const email = normalizeEmail(String(backfill.email ?? ""));
    if (leadId && email) {
      completedBackfills.push({ leadId, email });
    }
  }

  return { messages, completedBackfills } as const;
}

export async function listLeadsForEmailSync(supabase: SupabaseAdmin) {
  const { data, error } = await supabase
    .from("leads")
    .select("lead_id, email, email_history_synced_for")
    .not("email", "is", null)
    .returns<Array<Omit<LeadEmailRow, "assigned_to">>>();

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? [])
    .map((lead) => ({
      leadId: lead.lead_id,
      email: normalizeEmail(lead.email),
      historySynced:
        normalizeEmail(lead.email_history_synced_for) === normalizeEmail(lead.email)
    }))
    .filter((lead) => lead.email.length > 0);
}

export async function recordSyncedLeadEmails({
  supabase,
  mailbox,
  messages,
  completedBackfills
}: {
  supabase: SupabaseAdmin;
  mailbox: string;
  messages: SyncedEmail[];
  completedBackfills: CompletedBackfill[];
}) {
  const { data: leadRows, error: leadError } = await supabase
    .from("leads")
    .select("lead_id, email, assigned_to, email_history_synced_for")
    .not("email", "is", null)
    .returns<LeadEmailRow[]>();

  if (leadError) {
    throw new Error(leadError.message);
  }

  const leadsByEmail = new Map<string, LeadEmailRow[]>();
  for (const lead of leadRows ?? []) {
    const email = normalizeEmail(lead.email);
    if (email) {
      leadsByEmail.set(email, [...(leadsByEmail.get(email) ?? []), lead]);
    }
  }

  const notifyByMessageId = new Map<string, boolean>();
  const bodyByMessageId = new Map<string, string>();
  const rows = [];
  const mailboxAddress = normalizeEmail(mailbox);
  const mailboxDomain = mailboxAddress.split("@")[1] ?? "";
  // A consumer Gmail mailbox has no team domain to recognise.
  const internalDomain = ["gmail.com", "googlemail.com"].includes(mailboxDomain)
    ? null
    : mailboxDomain;

  for (const message of messages) {
    const fromAddresses = extractEmailAddresses(message.from);
    const participants = new Set([
      ...fromAddresses,
      ...extractEmailAddresses(message.to),
      ...extractEmailAddresses(message.cc)
    ]);
    participants.delete(mailboxAddress);
    notifyByMessageId.set(message.messageId, message.notify);
    bodyByMessageId.set(message.messageId, message.body);
    // Mail written by the team is outgoing; anything else, including a
    // lead's colleague writing with the lead in copy, is incoming.
    const direction: LeadCommunicationDirection = fromAddresses.some(
      (address) =>
        address === mailboxAddress ||
        (internalDomain !== null && address.endsWith(`@${internalDomain}`))
    )
      ? "Outbound"
      : "Inbound";

    for (const address of Array.from(participants)) {
      for (const lead of leadsByEmail.get(address) ?? []) {
        const preview = emailPreview(message.body);
        rows.push({
          lead_id: lead.lead_id,
          date: message.date,
          channel: "Email",
          direction,
          summary: preview ? `${message.subject}\n\n${preview}` : message.subject,
          source: "Gmail",
          logged_by: null,
          email_message_id: message.messageId,
          gmail_message_id: message.gmailMessageId,
          gmail_thread_id: message.threadId,
          email_subject: message.subject,
          email_from: message.from,
          email_to: [message.to, message.cc].filter(Boolean).join(", ")
        });
      }
    }
  }

  let inserted: InsertedLogRow[] = [];
  if (rows.length > 0) {
    // ignoreDuplicates returns only the rows that were actually inserted, so
    // re-sent messages are neither logged nor posted to Slack twice.
    const { data, error } = await supabase
      .from("lead_communication_log")
      .upsert(rows, {
        onConflict: "lead_id,email_message_id",
        ignoreDuplicates: true
      })
      .select("log_id, lead_id, date, direction, email_message_id, email_subject, email_from, email_to")
      .returns<InsertedLogRow[]>();

    if (error) {
      throw new Error(error.message);
    }
    inserted = data ?? [];
  }

  const leadsById = new Map((leadRows ?? []).map((lead) => [lead.lead_id, lead]));
  for (const backfill of completedBackfills) {
    const lead = leadsById.get(backfill.leadId);
    // Skip if the lead's address changed while the import was running; the
    // next run imports history for the new address.
    if (!lead || normalizeEmail(lead.email) !== backfill.email) {
      continue;
    }
    const { error } = await supabase
      .from("leads")
      .update({ email_history_synced_for: backfill.email })
      .eq("lead_id", backfill.leadId);
    if (error) {
      throw new Error(error.message);
    }
  }

  const toNotify = inserted.filter((row) => notifyByMessageId.get(row.email_message_id));
  if (toNotify.length > 0) {
    await postLeadEmailSlackUpdates({
      supabase,
      rows: toNotify,
      bodyByMessageId,
      leadsById
    });
  }

  return {
    logged: inserted.length,
    duplicates: rows.length - inserted.length,
    notified: toNotify.length
  };
}

async function postLeadEmailSlackUpdates({
  supabase,
  rows,
  bodyByMessageId,
  leadsById
}: {
  supabase: SupabaseAdmin;
  rows: InsertedLogRow[];
  bodyByMessageId: Map<string, string>;
  leadsById: Map<string, LeadEmailRow>;
}) {
  const staffMembers = await activeStaffMembers(supabase);
  const rowsByLead = new Map<string, InsertedLogRow[]>();
  for (const row of rows) {
    rowsByLead.set(row.lead_id, [...(rowsByLead.get(row.lead_id) ?? []), row]);
  }

  for (const [leadId, leadRows] of Array.from(rowsByLead)) {
    const sorted = [...leadRows].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    const hasInbound = sorted.some((row) => row.direction === "Inbound");
    const assignee = staffMembers.find(
      (staffMember) => staffMember.user_id === leadsById.get(leadId)?.assigned_to
    );
    const shown = sorted.slice(-MAX_EMAILS_PER_SLACK_POST);
    const sections = shown.map((row) =>
      slackFieldTable(
        row.direction === "Inbound" ? "LEAD EMAIL RECEIVED" : "LEAD EMAIL SENT",
        [
          ["Lead ID", leadId],
          ["From", row.email_from],
          ["To", row.email_to],
          ["Subject", row.email_subject],
          ["Date", formatDateForSlack(row.date)],
          ["Preview", emailPreview(bodyByMessageId.get(row.email_message_id) ?? "", SLACK_PREVIEW_LENGTH)]
        ]
      )
    );
    const hidden = sorted.length - shown.length;
    const message = [
      ...(hidden > 0
        ? [`_${hidden} earlier email${hidden === 1 ? "" : "s"} logged on the lead page._`]
        : []),
      ...sections
    ].join("\n\n");

    // A reply from the lead mentions the assignee; outgoing mail does not.
    await postLeadSlackThreadReply({
      supabaseAdmin: supabase,
      leadId,
      staffMembers,
      failureMessage: `Lead email thread notification failed for ${leadId}`,
      message: hasInbound
        ? withSlackMentions(message, [assignee?.slack_user_id])
        : message
    });
  }
}
