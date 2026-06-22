import { queueTicketOpenedEmail } from "@/lib/email/outbound-events";
import { sendSlackChannelMessage } from "@/lib/notifications/slack";
import { ticketOpenedSlackMessage } from "@/lib/notifications/ticket-messages";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

type GoogleAppsScriptPayload = {
  body?: string;
  date?: string;
  emailId?: string;
  from?: string;
  subject?: string;
  threadId?: string;
};

export async function POST(request: Request) {
  const configuredSecret = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!configuredSecret || token !== configuredSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: GoogleAppsScriptPayload;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const emailId = cleanText(payload.emailId);
  const threadId = cleanText(payload.threadId);
  const subject = cleanText(payload.subject) || "Email support request";
  const body = cleanText(payload.body);
  const receivedAt = parseDate(payload.date);
  const sender = parseSender(cleanText(payload.from));

  if (!emailId || !sender.email || !body) {
    return NextResponse.json(
      { error: "emailId, from, and body are required" },
      { status: 400 }
    );
  }

  const supabase = createSupabaseAdminClient();

  const { data: existingTicket } = await supabase
    .from("tickets")
    .select("ticket_id, subject, customer_email, customer_name, customer_notified_at, inbound_email_thread_id")
    .eq("inbound_email_message_id", emailId)
    .maybeSingle<{
      ticket_id: string;
      subject: string;
      customer_email: string | null;
      customer_name: string | null;
      customer_notified_at: string | null;
      inbound_email_thread_id: string | null;
    }>();

  if (existingTicket) {
    if (!existingTicket.customer_notified_at) {
      await queueTicketOpenedEmail({
        customerEmail: existingTicket.customer_email,
        customerName: existingTicket.customer_name,
        gmailThreadId: existingTicket.inbound_email_thread_id,
        subject: existingTicket.subject,
        supabase,
        ticketId: existingTicket.ticket_id
      });
    }

    return NextResponse.json({
      duplicate: true,
      ticketId: existingTicket.ticket_id,
      queuedCustomerReply: !existingTicket.customer_notified_at
    });
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("business_id, business_name")
    .ilike("email", sender.email)
    .maybeSingle<{ business_id: string; business_name: string }>();

  const { error: eventError } = await supabase.from("inbound_email_events").insert({
    provider: "google_apps_script",
    provider_message_id: emailId,
    provider_thread_id: threadId,
    sender_email: sender.email,
    sender_name: sender.name,
    subject,
    body_text: body,
    received_at: receivedAt.toISOString(),
    raw_payload: payload,
    processing_status: "Processing"
  });

  if (eventError && !eventError.message.includes("duplicate key")) {
    return NextResponse.json({ error: eventError.message }, { status: 500 });
  }

  const { data: createdTicket, error: ticketError } = await supabase
    .from("tickets")
    .insert({
      business_id: business?.business_id ?? null,
      reported_by: sender.name,
      channel_received: "Email",
      issue_category: "Inquiry",
      sub_category: "Other",
      subject,
      issue_description: body,
      interaction_mode: "Inbound",
      account_status: business ? "Active" : "NA",
      priority: "Medium",
      assigned_to: null,
      status: "Open",
      source: "Email",
      customer_email: sender.email,
      customer_name: sender.name,
      inbound_email_body: body,
      inbound_email_message_id: emailId,
      inbound_email_thread_id: threadId,
      date_raised: receivedAt.toISOString()
    })
    .select("ticket_id")
    .single<{ ticket_id: string }>();

  if (ticketError) {
    await markInboundEvent(supabase, emailId, {
      processing_status: "Failed",
      error_message: ticketError.message
    });

    return NextResponse.json({ error: ticketError.message }, { status: 500 });
  }

  const queuedCustomerReply = await queueTicketOpenedEmail({
    customerEmail: sender.email,
    customerName: sender.name,
    gmailThreadId: threadId,
    subject,
    supabase,
    ticketId: createdTicket.ticket_id
  });

  await markInboundEvent(supabase, emailId, {
    ticket_id: createdTicket.ticket_id,
    matched_business_id: business?.business_id ?? null,
    processing_status: "Processed",
    error_message: null
  });

  await notifySlackForInboundTicket({
    supabase,
    ticketId: createdTicket.ticket_id
  });

  return NextResponse.json(
    {
      ticketId: createdTicket.ticket_id,
      matchedBusinessId: business?.business_id ?? null,
      queuedCustomerReply
    },
    { status: 201 }
  );
}

async function notifySlackForInboundTicket({
  supabase,
  ticketId
}: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  ticketId: string;
}) {
  const token = process.env.SLACK_BOT_TOKEN;
  const channelId = process.env.SLACK_CRM_TICKETS_CHANNEL_ID;

  try {
    if (!token) {
      throw new Error("SLACK_BOT_TOKEN is not configured.");
    }

    if (!channelId) {
      throw new Error("SLACK_CRM_TICKETS_CHANNEL_ID is not configured.");
    }

    const { data: ticket } = await supabase
      .from("tickets")
      .select("ticket_id, subject, business_id, issue_category, sub_category, priority, status, assigned_to, sla_deadline, customer_email")
      .eq("ticket_id", ticketId)
      .maybeSingle<{
        ticket_id: string;
        subject: string;
        business_id: string | null;
        issue_category: string;
        sub_category: string | null;
        priority: string;
        status: string;
        assigned_to: string | null;
        sla_deadline: string | null;
        customer_email: string | null;
      }>();

    if (!ticket) {
      return;
    }

    const { data: business } = ticket.business_id
      ? await supabase
          .from("businesses")
          .select("business_name, owner_name")
          .eq("business_id", ticket.business_id)
          .maybeSingle<{ business_name: string; owner_name: string | null }>()
      : { data: null };

    const message = `${ticketOpenedSlackMessage({
      assignedTo: ticket.assigned_to ?? "Unassigned",
      businessName: business?.business_name ?? "Unmatched email",
      businessOwner: business?.owner_name,
      category: ticket.issue_category,
      priority: ticket.priority,
      sla: ticket.sla_deadline,
      subCategory: ticket.sub_category,
      subject: ticket.subject,
      ticketId: ticket.ticket_id
    })}\nFrom: ${ticket.customer_email ?? "Unknown"}`;
    const posted = await sendSlackChannelMessage({
      channelId,
      message,
      module: "Tickets",
      recordId: ticket.ticket_id,
      token
    });

    await supabase
      .from("tickets")
      .update({
        slack_channel_id: posted.channelId,
        slack_thread_ts: posted.ts
      })
      .eq("ticket_id", ticket.ticket_id);
  } catch (error) {
    await supabase.from("automation_events").insert({
      rule_key: "ticket_email_created_channel_notification",
      module: "Tickets",
      record_id: ticketId,
      target_channel: "crm_tickets",
      message: `Email ticket Slack notification failed for ${ticketId}`,
      status: "Failed",
      dedupe_key: `ticket_email_created_channel_notification:${ticketId}`,
      payload: {
        ticket_id: ticketId
      },
      error_message:
        error instanceof Error ? error.message : "Unknown Slack notification error"
    });
  }
}

function cleanText(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function parseDate(value: unknown) {
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function parseSender(from: string | null) {
  if (!from) {
    return { email: null, name: null };
  }

  const match = from.match(/^(.*?)<([^>]+)>$/);

  if (match) {
    return {
      name: match[1].replace(/^"|"$/g, "").trim() || null,
      email: match[2].trim().toLowerCase()
    };
  }

  const emailMatch = from.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);

  return {
    name: null,
    email: emailMatch?.[0].toLowerCase() ?? null
  };
}

async function markInboundEvent(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  providerMessageId: string,
  values: Record<string, string | null>
) {
  await supabase
    .from("inbound_email_events")
    .update(values)
    .eq("provider_message_id", providerMessageId);
}
