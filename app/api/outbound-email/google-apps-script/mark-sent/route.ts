import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

type MarkSentPayload = {
  errorMessage?: string;
  eventId?: string;
  status?: "Sent" | "Failed";
};

export async function POST(request: Request) {
  const unauthorized = verifyRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  let payload: MarkSentPayload;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!payload.eventId || !payload.status) {
    return NextResponse.json(
      { error: "eventId and status are required" },
      { status: 400 }
    );
  }

  const supabase = createSupabaseAdminClient();
  const { data: event } = await supabase
    .from("outbound_email_events")
    .select("event_id, ticket_id, notification_type")
    .eq("event_id", payload.eventId)
    .maybeSingle<{
      event_id: string;
      ticket_id: string;
      notification_type: string | null;
    }>();

  if (!event) {
    return NextResponse.json({ error: "Outbound event not found" }, { status: 404 });
  }

  const sentAt = payload.status === "Sent" ? new Date().toISOString() : null;
  const { error } = await supabase
    .from("outbound_email_events")
    .update({
      status: payload.status,
      sent_at: sentAt,
      error_message: payload.status === "Failed" ? payload.errorMessage ?? "Gmail send failed" : null
    })
    .eq("event_id", payload.eventId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (payload.status === "Sent") {
    const ticketUpdate =
      event.notification_type === "Ticket Opened"
        ? { customer_notified_at: sentAt }
        : { closure_notified_at: sentAt };

    await supabase
      .from("tickets")
      .update(ticketUpdate)
      .eq("ticket_id", event.ticket_id);
  }

  return NextResponse.json({ ok: true });
}

function verifyRequest(request: Request) {
  const configuredSecret = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();

  if (!configuredSecret || token !== configuredSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
