import {
  isValidSessionId,
  isValidTransactionId,
  normalizeAttachments,
  normalizeMerchantId,
  normalizeText,
  publicTicketStatus,
  supportJson,
  supportOptions
} from "@/lib/support/api";
import { queueTicketOpenedEmail } from "@/lib/email/outbound-events";
import { sendSlackChannelMessage } from "@/lib/notifications/slack";
import { ticketOpenedSlackMessage } from "@/lib/notifications/ticket-messages";
import { getSupportService } from "@/lib/support/services";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type WidgetTicketPayload = {
  merchant_id?: unknown;
  service_id?: unknown;
  transaction_id?: unknown;
  description?: unknown;
  attachments?: unknown;
  session_id?: unknown;
};

type ExistingWidgetTicket = {
  ticket_id: string;
  status: string;
  created_at: string;
  subject?: string | null;
  issue_category?: string | null;
  sub_category?: string | null;
  priority?: string | null;
  slack_thread_ts?: string | null;
  customer_email?: string | null;
  customer_name?: string | null;
  inbound_email_thread_id?: string | null;
  customer_notified_at?: string | null;
};

async function queueWidgetTicketOpenedEmail({
  customerEmail,
  customerName,
  subject,
  supabase,
  threadId,
  ticketId
}: {
  customerEmail: string | null;
  customerName: string | null;
  subject: string;
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  threadId: string | null;
  ticketId: string;
}) {
  if (!customerEmail) {
    return false;
  }

  return queueTicketOpenedEmail({
    customerEmail,
    customerName,
    gmailThreadId: threadId,
    subject,
    supabase,
    ticketId
  });
}

async function notifySlackForWidgetTicket({
  businessName,
  businessOwner,
  category,
  priority,
  serviceName,
  subject,
  supabase,
  ticketId
}: {
  businessName: string;
  businessOwner: string | null;
  category: string;
  priority: string;
  serviceName: string;
  subject: string;
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  ticketId: string;
}) {
  const token = process.env.SLACK_BOT_TOKEN;
  const channelId = process.env.SLACK_CRM_TICKETS_CHANNEL_ID;

  if (!token || !channelId) {
    await supabase.from("automation_events").upsert(
      {
        rule_key: "ticket_channel_thread_notification",
        module: "Tickets",
        record_id: ticketId,
        target_user_id: null,
        target_channel: "crm_tickets",
        message: `Ticket channel notification skipped for ${ticketId}`,
        status: "Failed",
        dedupe_key: `ticket_channel_thread_notification:${ticketId}`,
        payload: {
          ticket_id: ticketId,
          source: "Widget"
        },
        processed_at: new Date().toISOString(),
        error_message:
          !token
            ? "SLACK_BOT_TOKEN is not configured."
            : "SLACK_CRM_TICKETS_CHANNEL_ID is not configured."
      },
      { onConflict: "dedupe_key" }
    );
    return;
  }

  try {
    const posted = await sendSlackChannelMessage({
      channelId,
      message: ticketOpenedSlackMessage({
        assignedTo: "Unassigned",
        businessName,
        businessOwner,
        category,
        priority,
        sla: null,
        subCategory: serviceName,
        subject,
        ticketId
      }),
      module: "Tickets",
      recordId: ticketId,
      token
    });

    await supabase
      .from("tickets")
      .update({
        slack_channel_id: posted.channelId,
        slack_thread_ts: posted.ts
      })
      .eq("ticket_id", ticketId);

    await supabase.from("automation_events").upsert(
      {
        rule_key: "ticket_channel_thread_notification",
        module: "Tickets",
        record_id: ticketId,
        target_user_id: null,
        target_channel: "crm_tickets",
        message: `Ticket channel notification sent for ${ticketId}`,
        status: "Sent",
        dedupe_key: `ticket_channel_thread_notification:${ticketId}`,
        payload: {
          ticket_id: ticketId,
          source: "Widget",
          slack_channel_id: posted.channelId,
          slack_thread_ts: posted.ts
        },
        processed_at: new Date().toISOString(),
        error_message: null
      },
      { onConflict: "dedupe_key" }
    );
  } catch (error) {
    await supabase.from("automation_events").upsert(
      {
        rule_key: "ticket_channel_thread_notification",
        module: "Tickets",
        record_id: ticketId,
        target_user_id: null,
        target_channel: "crm_tickets",
        message: `Ticket channel notification failed for ${ticketId}`,
        status: "Failed",
        dedupe_key: `ticket_channel_thread_notification:${ticketId}`,
        payload: {
          ticket_id: ticketId,
          source: "Widget"
        },
        processed_at: new Date().toISOString(),
        error_message:
          error instanceof Error
            ? error.message
            : "Slack channel notification failed."
      },
      { onConflict: "dedupe_key" }
    );
  }
}

export async function OPTIONS(request: Request) {
  return supportOptions(request);
}

export async function POST(request: Request) {
  let payload: WidgetTicketPayload;

  try {
    payload = (await request.json()) as WidgetTicketPayload;
  } catch {
    return supportJson(request, { error: "Invalid JSON payload" }, { status: 400 });
  }

  const merchantId = normalizeMerchantId(payload.merchant_id);
  const serviceId = normalizeText(payload.service_id);
  const service = serviceId ? getSupportService(serviceId) : null;
  const transactionId = normalizeText(payload.transaction_id);
  const description = normalizeText(payload.description);
  const sessionId = normalizeText(payload.session_id);
  const attachments = normalizeAttachments(payload.attachments);

  if (!merchantId) {
    return supportJson(request, { error: "merchant_id is required" }, { status: 400 });
  }

  if (!serviceId || !service) {
    return supportJson(request, { error: "Valid service_id is required" }, { status: 400 });
  }

  if (!description || description.length < 10) {
    return supportJson(
      request,
      { error: "description must be at least 10 characters" },
      { status: 400 }
    );
  }

  if (!sessionId || !isValidSessionId(sessionId)) {
    return supportJson(
      request,
      { error: "session_id must be 8-120 URL-safe characters" },
      { status: 400 }
    );
  }

  if (transactionId && !isValidTransactionId(transactionId)) {
    return supportJson(
      request,
      { error: "transaction_id contains unsupported characters" },
      { status: 400 }
    );
  }

  const supabase = createSupabaseAdminClient();

  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("business_id, business_name, owner_name, email")
    .eq("business_id", merchantId)
    .maybeSingle<{
      business_id: string;
      business_name: string;
      owner_name: string | null;
      email: string | null;
    }>();

  if (businessError) {
    return supportJson(request, { error: businessError.message }, { status: 500 });
  }

  if (!business) {
    return supportJson(request, { error: "Merchant not found" }, { status: 404 });
  }

  const { data: sessionTicket } = await supabase
    .from("tickets")
    .select("ticket_id, status, created_at, subject, issue_category, sub_category, priority, slack_thread_ts, customer_email, customer_name, inbound_email_thread_id, customer_notified_at")
    .eq("source", "Widget")
    .eq("widget_session_id", sessionId)
    .maybeSingle<ExistingWidgetTicket>();

  if (sessionTicket) {
    if (!sessionTicket.slack_thread_ts) {
      await notifySlackForWidgetTicket({
        businessName: business.business_name,
        businessOwner: business.owner_name,
        category: sessionTicket.issue_category ?? "Inquiry",
        priority: sessionTicket.priority ?? "Medium",
        serviceName: sessionTicket.sub_category ?? service.name,
        subject: sessionTicket.subject ?? `${service.name} support request`,
        supabase,
        ticketId: sessionTicket.ticket_id
      });
    }

    if (!sessionTicket.customer_notified_at) {
      await queueWidgetTicketOpenedEmail({
        customerEmail: sessionTicket.customer_email ?? business.email ?? null,
        customerName:
          sessionTicket.customer_name ??
          business.owner_name ??
          business.business_name,
        subject: sessionTicket.subject ?? `${service.name} support request`,
        supabase,
        threadId: sessionTicket.inbound_email_thread_id ?? `widget:${sessionId}`,
        ticketId: sessionTicket.ticket_id
      });
    }

    return supportJson(request, {
      ticket_reference: sessionTicket.ticket_id,
      status: publicTicketStatus(sessionTicket.status),
      created_at: sessionTicket.created_at,
      idempotent: true
    });
  }

  if (transactionId) {
    const { data: duplicateTransaction } = await supabase
      .from("tickets")
      .select("ticket_id, status, created_at")
      .eq("source", "Widget")
      .eq("business_id", merchantId)
      .eq("widget_transaction_id", transactionId)
      .maybeSingle<ExistingWidgetTicket>();

    if (duplicateTransaction) {
      return supportJson(
        request,
        {
          error: "A ticket already exists for this transaction",
          ticket_reference: duplicateTransaction.ticket_id,
          status: publicTicketStatus(duplicateTransaction.status),
          created_at: duplicateTransaction.created_at
        },
        { status: 409 }
      );
    }
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const [{ count: sessionCount }, { count: merchantCount }] = await Promise.all([
    supabase
      .from("tickets")
      .select("ticket_id", { count: "exact", head: true })
      .eq("source", "Widget")
      .eq("widget_session_id", sessionId)
      .gte("date_raised", oneHourAgo),
    supabase
      .from("tickets")
      .select("ticket_id", { count: "exact", head: true })
      .eq("source", "Widget")
      .eq("business_id", merchantId)
      .gte("date_raised", oneHourAgo)
  ]);

  if ((sessionCount ?? 0) >= 3) {
    return supportJson(
      request,
      { error: "This support session has reached its ticket limit. Contact support directly." },
      { status: 429 }
    );
  }

  if ((merchantCount ?? 0) >= 9) {
    return supportJson(
      request,
      { error: "This merchant account has reached its hourly ticket limit. Contact support directly." },
      { status: 429 }
    );
  }

  const subject = `${service.name} support request`;
  const customerName = business.owner_name ?? business.business_name;
  const customerEmail = business.email ?? null;
  const threadId = customerEmail ? `widget:${sessionId}` : null;

  const { data: createdTicket, error: ticketError } = await supabase
    .from("tickets")
    .insert({
      business_id: business.business_id,
      reported_by: customerName,
      channel_received: "Dashboard",
      issue_category: "Inquiry",
      sub_category: service.name,
      subject,
      issue_description: description,
      interaction_mode: "Inbound",
      account_status: "Active",
      priority: "Medium",
      assigned_to: null,
      status: "Open",
      source: "Widget",
      customer_email: customerEmail,
      customer_name: customerName,
      inbound_email_thread_id: threadId,
      service_id: service.service_id,
      widget_transaction_id: transactionId,
      widget_session_id: sessionId,
      widget_attachments: attachments
    })
    .select("ticket_id, status, created_at")
    .single<ExistingWidgetTicket>();

  if (ticketError) {
    if (ticketError.code === "23505") {
      return supportJson(
        request,
        { error: "Duplicate widget ticket submission" },
        { status: 409 }
      );
    }

    return supportJson(request, { error: ticketError.message }, { status: 500 });
  }

  await supabase.from("support_widget_sessions").upsert(
    {
      session_id: sessionId,
      merchant_id: business.business_id,
      last_step_completed: "submitted",
      completed: true,
      ticket_reference: createdTicket.ticket_id,
      metadata: {
        service_id: service.service_id,
        transaction_id: transactionId,
        attachment_count: attachments.length
      }
    },
    { onConflict: "session_id" }
  );

  await notifySlackForWidgetTicket({
    businessName: business.business_name,
    businessOwner: business.owner_name,
    category: "Inquiry",
    priority: "Medium",
    serviceName: service.name,
    subject,
    supabase,
    ticketId: createdTicket.ticket_id
  });

  await queueWidgetTicketOpenedEmail({
    customerEmail,
    customerName,
    subject,
    supabase,
    threadId,
    ticketId: createdTicket.ticket_id
  });

  return supportJson(
    request,
    {
      ticket_reference: createdTicket.ticket_id,
      status: publicTicketStatus(createdTicket.status),
      created_at: createdTicket.created_at
    },
    { status: 201 }
  );
}
