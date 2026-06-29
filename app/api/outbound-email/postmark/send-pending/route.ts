import { sendTransactionalEmail } from "@/lib/email/postmark";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  return handleSendPending(request);
}

export async function POST(request: Request) {
  return handleSendPending(request);
}

async function handleSendPending(request: Request) {
  const unauthorized = verifyRequest(request);
  if (unauthorized) {
    return unauthorized;
  }

  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("outbound_email_events")
    .select("event_id, ticket_id, notification_type, recipient_email, recipient_name, subject, body_text, body_html, gmail_thread_id")
    .eq("provider", "postmark")
    .eq("status", "Pending")
    .order("created_at", { ascending: true })
    .limit(20)
    .returns<
      Array<{
        event_id: string;
        ticket_id: string;
        notification_type: string;
        recipient_email: string;
        recipient_name: string | null;
        subject: string;
        body_text: string;
        body_html: string | null;
        gmail_thread_id: string | null;
      }>
    >();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = [];

  for (const event of data ?? []) {
    try {
      const result = await sendTransactionalEmail({
        to: {
          email: event.recipient_email,
          name: event.recipient_name
        },
        subject: event.subject,
        textContent: event.body_text,
        htmlContent: event.body_html || event.body_text.replace(/\n/g, "<br/>")
      });

      await supabase
        .from("outbound_email_events")
        .update({
          status: "Sent",
          sent_at: new Date().toISOString(),
          postmark_message_id: result.MessageID,
          error_message: null
        })
        .eq("event_id", event.event_id);

      const ticketUpdate =
        event.notification_type === "Ticket Opened"
          ? { customer_notified_at: new Date().toISOString() }
          : { closure_notified_at: new Date().toISOString() };

      await supabase
        .from("tickets")
        .update(ticketUpdate)
        .eq("ticket_id", event.ticket_id);

      results.push({ eventId: event.event_id, success: true, messageId: result.MessageID });
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown Postmark error";

      await supabase
        .from("outbound_email_events")
        .update({
          status: "Failed",
          error_message: errorMessage
        })
        .eq("event_id", event.event_id);

      results.push({ eventId: event.event_id, success: false, error: errorMessage });
    }
  }

  return NextResponse.json({ sent: results });
}

function verifyRequest(request: Request) {
  const configuredSecret = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  const cronHeader = request.headers.get("x-vercel-cron-signature") ?? "";

  if (
    (configuredSecret && token === configuredSecret) ||
    (cronSecret && token === cronSecret) ||
    (cronSecret && cronHeader === cronSecret)
  ) {
    return null;
  }

  if (!configuredSecret && !cronSecret) {
    return NextResponse.json(
      { error: "Email sender secret is not configured" },
      { status: 500 }
    );
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
