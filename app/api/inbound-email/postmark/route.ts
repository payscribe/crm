import { queueTicketOpenedEmail } from "@/lib/email/outbound-events";
import { sendSlackChannelMessage } from "@/lib/notifications/slack";
import { ticketOpenedSlackMessage } from "@/lib/notifications/ticket-messages";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

type PostmarkInboundWebhookPayload = {
  From: string;
  FromFull: {
    Email: string;
    Name: string;
  };
  To: string;
  ToFull: Array<{
    Email: string;
    Name: string;
  }>;
  Cc: string;
  CcFull: Array<{
    Email: string;
    Name: string;
  }>;
  Subject: string;
  Date: string;
  MailboxHash: string;
  TextBody: string;
  HtmlBody: string;
  MessageID: string;
  MessageStream: string;
  Headers?: Array<{ Name: string; Value: string }>;
};

export async function POST(request: Request) {
  const configuredSecret = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("secret") ?? "";

  if (!configuredSecret || token !== configuredSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: PostmarkInboundWebhookPayload;

  try {
    payload = (await request.json()) as PostmarkInboundWebhookPayload;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  const emailId = payload.MessageID;
  const inReplyTo = payload.Headers?.find(h => h.Name === "In-Reply-To")?.Value ?? null;
  const threadId = inReplyTo ?? payload.MessageID;
  const subject = payload.Subject || "Email support request";
  const body = payload.TextBody || stripHtml(payload.HtmlBody);
  const dateStr = payload.Date;
  const receivedAt = parseDate(dateStr);
  const sender = {
    email: payload.FromFull?.Email ?? payload.From,
    name: payload.FromFull?.Name ?? null
  };

  if (!emailId || !sender.email || !body) {
    return NextResponse.json(
      { error: "From, MessageID, and TextBody are required" },
      { status: 400 }
    );
  }

  const supabase = createSupabaseAdminClient();

  type ExistingTicket = {
    ticket_id: string;
    subject: string;
    customer_email: string | null;
    customer_name: string | null;
    customer_notified_at: string | null;
    inbound_email_thread_id: string | null;
  };

  // Check for exact duplicate (same MessageID)
  const { data: duplicateTicket } = await supabase
    .from("tickets")
    .select("ticket_id, subject, customer_email, customer_name, customer_notified_at, inbound_email_thread_id")
    .eq("inbound_email_message_id", emailId)
    .maybeSingle<ExistingTicket>();

  if (duplicateTicket) {
    if (!duplicateTicket.customer_notified_at) {
      await queueTicketOpenedEmail({
        customerEmail: duplicateTicket.customer_email,
        customerName: duplicateTicket.customer_name,
        gmailThreadId: duplicateTicket.inbound_email_thread_id,
        subject: duplicateTicket.subject,
        supabase,
        ticketId: duplicateTicket.ticket_id
      });
    }

    return NextResponse.json({
      duplicate: true,
      ticketId: duplicateTicket.ticket_id
    });
  }

  // Check if this is a reply to an existing ticket thread
  const { data: threadTicket } = inReplyTo
    ? await supabase
        .from("tickets")
        .select("ticket_id, subject, customer_email, customer_name, customer_notified_at, inbound_email_thread_id")
        .eq("inbound_email_thread_id", inReplyTo)
        .maybeSingle<ExistingTicket>()
    : { data: null };

  if (threadTicket) {
    // Log the reply email so it's visible in the audit trail
    await supabase.from("inbound_email_events").insert({
      provider: "postmark",
      provider_message_id: emailId,
      provider_thread_id: threadId,
      sender_email: sender.email,
      sender_name: sender.name,
      subject,
      body_text: body,
      received_at: receivedAt.toISOString(),
      raw_payload: payload,
      processing_status: "Processed",
      ticket_id: threadTicket.ticket_id
    });

    return NextResponse.json({
      reply: true,
      ticketId: threadTicket.ticket_id
    });
  }

  const { data: business } = await supabase
    .from("businesses")
    .select("business_id, business_name")
    .ilike("email", sender.email)
    .maybeSingle<{ business_id: string; business_name: string }>();

  const { error: eventError } = await supabase.from("inbound_email_events").insert({
    provider: "postmark",
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
      sub_category: null,
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
    if (!token || !channelId) {
      return;
    }

    const { data: ticket } = await supabase
      .from("tickets")
      .select("ticket_id, subject, business_id, issue_category, sub_category, priority, status, assigned_to, sla_deadline, customer_email, slack_channel_id, slack_thread_ts")
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
        slack_channel_id: string | null;
        slack_thread_ts: string | null;
      }>();

    if (!ticket || (ticket.slack_channel_id && ticket.slack_thread_ts)) {
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
  } catch {
  }
}

function parseDate(value: unknown) {
  const parsed = new Date(String(value ?? ""));
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function stripHtml(value: unknown) {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim();
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
