import {
  isValidSessionId,
  normalizeMerchantId,
  normalizeText,
  publicTicketStatus,
  supportJson,
  supportOptions
} from "@/lib/support/api";
import { deliverSlackEventsImmediately } from "@/lib/notifications/automation-delivery";
import { sendSlackChannelMessage } from "@/lib/notifications/slack";
import { ticketCustomerReplySlackMessage } from "@/lib/notifications/ticket-messages";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  parseTicketAttachments,
  uploadTicketAttachment
} from "@/lib/support/ticket-attachments";
import type { NewAutomationEvent } from "@/lib/types/automation-events";
import type { StaffUser } from "@/lib/types/users";

export const dynamic = "force-dynamic";

type TicketLookupProps = {
  params: {
    ticketReference: string;
  };
};

export async function OPTIONS(request: Request) {
  return supportOptions(request);
}

export async function GET(request: Request, { params }: TicketLookupProps) {
  const { searchParams } = new URL(request.url);
  const merchantId = normalizeMerchantId(searchParams.get("merchant_id"));
  const sessionId = normalizeText(searchParams.get("session_id"));

  if (!merchantId) {
    return supportJson(request, { error: "merchant_id is required" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: ticket, error } = await supabase
    .from("tickets")
    .select("ticket_id, business_id, status, source, widget_session_id, updated_at, resolution_notes")
    .eq("ticket_id", params.ticketReference)
    .eq("business_id", merchantId)
    .maybeSingle<{
      ticket_id: string;
      business_id: string | null;
      status: string;
      source: string;
      widget_session_id: string | null;
      updated_at: string;
      resolution_notes: string | null;
    }>();

  if (error) {
    return supportJson(request, { error: error.message }, { status: 500 });
  }

  if (!ticket) {
    return supportJson(request, { error: "Ticket not found" }, { status: 404 });
  }

  const { data: notes } = await supabase
    .from("ticket_notes")
    .select("note_id, note_body, created_by, sender_type, sender_name, attachments, created_at")
    .eq("ticket_id", ticket.ticket_id)
    .order("created_at", { ascending: true })
    .limit(25)
    .returns<Array<{
      note_id: string;
      note_body: string;
      created_by: string | null;
      sender_type: "agent" | "customer" | "system";
      sender_name: string | null;
      attachments: unknown;
      created_at: string;
    }>>();

  const responses = (notes ?? []).map((note) => ({
    id: note.note_id,
    author: note.sender_type === "customer" ? note.sender_name ?? "You" : note.sender_name ?? "Support",
    sender_type: note.sender_type,
    body: note.note_body,
    attachments: publicAttachments(
      note.attachments,
      ticket.ticket_id,
      merchantId,
      sessionId ?? ""
    ),
    created_at: note.created_at
  }));

  if (ticket.resolution_notes) {
    responses.push({
      id: `${ticket.ticket_id}:resolution`,
      author: "Support",
      sender_type: "system",
      body: ticket.resolution_notes,
      attachments: [],
      created_at: ticket.updated_at
    });
  }

  const latestResponse = responses[responses.length - 1] ?? null;

  return supportJson(request, {
    ticket_reference: ticket.ticket_id,
    status: publicTicketStatus(ticket.status),
    last_updated: latestResponse?.created_at ?? ticket.updated_at,
    last_agent_note: latestResponse?.body ?? null,
    can_reply:
      ticket.source === "Widget" &&
      Boolean(sessionId) &&
      ticket.widget_session_id === sessionId,
    responses
  });
}

type CustomerReplyPayload = {
  merchant_id?: unknown;
  session_id?: unknown;
  body?: unknown;
  client_message_id?: unknown;
};

function publicAttachments(
  value: unknown,
  ticketReference: string,
  merchantId: string,
  sessionId: string
) {
  if (!sessionId) return [];
  return parseTicketAttachments(value).map(({ path: _path, ...attachment }) => ({
    ...attachment,
    url: `/api/v1/support/tickets/${encodeURIComponent(ticketReference)}/attachments/${encodeURIComponent(attachment.id)}?merchant_id=${encodeURIComponent(merchantId)}&session_id=${encodeURIComponent(sessionId)}`
  }));
}

export async function POST(request: Request, { params }: TicketLookupProps) {
  let payload: CustomerReplyPayload;
  let attachment: File | null = null;
  try {
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const formData = await request.formData();
      payload = {
        merchant_id: formData.get("merchant_id"),
        session_id: formData.get("session_id"),
        body: formData.get("body"),
        client_message_id: formData.get("client_message_id")
      };
      const file = formData.get("attachment");
      attachment = file instanceof File && file.size > 0 ? file : null;
    } else {
      payload = (await request.json()) as CustomerReplyPayload;
    }
  } catch {
    return supportJson(request, { error: "Invalid reply payload" }, { status: 400 });
  }

  const merchantId = normalizeMerchantId(payload.merchant_id);
  const sessionId = normalizeText(payload.session_id);
  const body = normalizeText(payload.body);
  const clientMessageId = normalizeText(payload.client_message_id);

  if (!merchantId || !sessionId || !isValidSessionId(sessionId)) {
    return supportJson(request, { error: "A valid merchant and widget session are required" }, { status: 400 });
  }
  if ((!body && !attachment) || (body?.length ?? 0) > 2000) {
    return supportJson(request, { error: "Add a message or attachment. Messages cannot exceed 2,000 characters." }, { status: 400 });
  }
  if (!clientMessageId || !isValidSessionId(clientMessageId)) {
    return supportJson(request, { error: "A valid client_message_id is required" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: ticket } = await supabase
    .from("tickets")
    .select("ticket_id, subject, status, source, widget_session_id, customer_name, assigned_to, slack_channel_id, slack_thread_ts")
    .eq("ticket_id", params.ticketReference)
    .eq("business_id", merchantId)
    .eq("source", "Widget")
    .maybeSingle<{
      ticket_id: string;
      subject: string;
      status: string;
      source: string;
      widget_session_id: string | null;
      customer_name: string | null;
      assigned_to: string | null;
      slack_channel_id: string | null;
      slack_thread_ts: string | null;
    }>();

  if (!ticket) {
    return supportJson(request, { error: "Ticket not found" }, { status: 404 });
  }
  if (ticket.widget_session_id !== sessionId) {
    return supportJson(request, { error: "This browser session cannot reply to that ticket" }, { status: 403 });
  }
  if (ticket.status === "Closed") {
    return supportJson(request, { error: "This ticket is closed and cannot receive replies" }, { status: 409 });
  }

  const minuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count } = await supabase
    .from("ticket_notes")
    .select("note_id", { count: "exact", head: true })
    .eq("ticket_id", ticket.ticket_id)
    .eq("sender_type", "customer")
    .gte("created_at", minuteAgo);
  if ((count ?? 0) >= 8) {
    return supportJson(request, { error: "Too many replies. Please wait a moment." }, { status: 429 });
  }

  const { data: existing } = await supabase
    .from("ticket_notes")
    .select("note_id, note_body, sender_type, sender_name, attachments, created_at")
    .eq("ticket_id", ticket.ticket_id)
    .eq("client_message_id", clientMessageId)
    .maybeSingle<{
      note_id: string;
      note_body: string;
      sender_type: string;
      sender_name: string | null;
      attachments: unknown;
      created_at: string;
    }>();
  if (existing) {
    return supportJson(request, {
      message: {
        id: existing.note_id,
        author: existing.sender_name ?? "You",
        sender_type: existing.sender_type,
        body: existing.note_body,
        attachments: publicAttachments(existing.attachments, ticket.ticket_id, merchantId, sessionId),
        created_at: existing.created_at
      },
      idempotent: true
    });
  }

  const senderName = ticket.customer_name ?? "Customer";
  let uploadedAttachment = null;
  try {
    uploadedAttachment = attachment
      ? await uploadTicketAttachment({ file: attachment, supabase, ticketId: ticket.ticket_id })
      : null;
  } catch (uploadError) {
    return supportJson(
      request,
      { error: uploadError instanceof Error ? uploadError.message : "Attachment upload failed" },
      { status: 400 }
    );
  }
  const { data: message, error } = await supabase
    .from("ticket_notes")
    .insert({
      ticket_id: ticket.ticket_id,
      note_body: body ?? "",
      created_by: null,
      sender_type: "customer",
      sender_name: senderName,
      client_message_id: clientMessageId,
      attachments: uploadedAttachment ? [uploadedAttachment] : []
    })
    .select("note_id, note_body, sender_type, sender_name, attachments, created_at")
    .single<{
      note_id: string;
      note_body: string;
      sender_type: string;
      sender_name: string | null;
      attachments: unknown;
      created_at: string;
    }>();

  if (error || !message) {
    if (uploadedAttachment) {
      await supabase.storage.from("ticket-attachments").remove([uploadedAttachment.path]);
    }
    return supportJson(request, { error: error?.message ?? "Unable to send reply" }, { status: 500 });
  }

  const slackMessage = ticketCustomerReplySlackMessage({
    customerName: senderName,
    message: body || `Attachment: ${uploadedAttachment?.name}`,
    subject: ticket.subject,
    ticketId: ticket.ticket_id
  });
  const slackToken = process.env.SLACK_BOT_TOKEN;
  const threadEvent: NewAutomationEvent = {
    rule_key: "ticket_customer_reply",
    module: "Tickets",
    record_id: ticket.ticket_id,
    target_user_id: null,
    target_channel: "crm_tickets",
    message: slackMessage,
    dedupe_key: `ticket_customer_reply:${message.note_id}:channel`,
    payload: {
      ticket_id: ticket.ticket_id,
      note_id: message.note_id,
      sender_name: senderName
    }
  };
  let threadDelivered = false;

  if (slackToken && ticket.slack_channel_id && ticket.slack_thread_ts) {
    try {
      await sendSlackChannelMessage({
        channelId: ticket.slack_channel_id,
        threadTs: ticket.slack_thread_ts,
        message: slackMessage,
        module: "Tickets",
        recordId: ticket.ticket_id,
        token: slackToken
      });
      await supabase.from("automation_events").upsert(
        {
          ...threadEvent,
          status: "Sent",
          processed_at: new Date().toISOString(),
          error_message: null
        },
        { onConflict: "dedupe_key" }
      );
      threadDelivered = true;
    } catch (notificationError) {
      await supabase.from("automation_events").upsert(
        {
          ...threadEvent,
          status: "Failed",
          processed_at: new Date().toISOString(),
          error_message:
            notificationError instanceof Error
              ? notificationError.message
              : "Slack delivery failed."
        },
        { onConflict: "dedupe_key" }
      );
    }
  }

  const { data: assignee } = ticket.assigned_to
    ? await supabase
        .from("users")
        .select("*")
        .eq("user_id", ticket.assigned_to)
        .maybeSingle<StaffUser>()
    : { data: null };
  const events: NewAutomationEvent[] = [];

  if (!threadDelivered) {
    events.push(threadEvent);
  }
  if (assignee?.slack_user_id) {
    events.push({
      ...threadEvent,
      target_user_id: assignee.user_id,
      target_channel: "slack_dm",
      dedupe_key: `ticket_customer_reply:${message.note_id}:${assignee.user_id}`
    });
  }
  if (events.length > 0) {
    await deliverSlackEventsImmediately({
      supabase,
      events,
      staffMembers: assignee ? [assignee] : []
    });
  }

  return supportJson(request, {
    message: {
      id: message.note_id,
      author: message.sender_name ?? "You",
      sender_type: message.sender_type,
      body: message.note_body,
      attachments: publicAttachments(message.attachments, ticket.ticket_id, merchantId, sessionId),
      created_at: message.created_at
    }
  }, { status: 201 });
}
