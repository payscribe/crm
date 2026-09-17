import { verifyGoogleScriptRequest } from "@/lib/email/google-script-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const rejected = verifyGoogleScriptRequest(request);
  if (rejected) return rejected;
  let body: { eventId?: unknown; status?: unknown; errorMessage?: unknown };
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body || typeof body.eventId !== "string" ||
      (body.status !== "Sent" && body.status !== "Failed")) {
    return NextResponse.json({ error: "Event ID and valid status are required" }, { status: 400 });
  }
  const supabase = createSupabaseAdminClient();
  const { data: event, error } = await supabase.from("outbound_email_events")
    .select("event_id, ticket_id, notification_type, status, sent_at")
    .eq("event_id", body.eventId).eq("provider", "google_apps_script").maybeSingle<{
      event_id: string; ticket_id: string; notification_type: string;
      status: string; sent_at: string | null;
    }>();
  if (error) return NextResponse.json({ error: "Unable to find event" }, { status: 500 });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  if (event.status === "Sent") return NextResponse.json({ ok: true, duplicate: true });
  const sentAt = new Date().toISOString();
  if (body.status === "Sent" && !process.env.GOOGLE_EMAIL_TEST_RECIPIENT?.trim()) {
    const field = event.notification_type === "Ticket Opened" ? "customer_notified_at"
      : event.notification_type === "Ticket Closed" ? "closure_notified_at" : null;
    if (field) {
      const { error: ticketError } = await supabase.from("tickets")
        .update({ [field]: sentAt }).eq("ticket_id", event.ticket_id);
      if (ticketError) return NextResponse.json({ error: "Email sent; ticket timestamp update failed" }, { status: 500 });
    }
  }
  const { error: updateError } = await supabase.from("outbound_email_events")
    .update({
      status: body.status,
      sent_at: body.status === "Sent" ? sentAt : null,
      error_message: body.status === "Failed"
        ? String(body.errorMessage ?? "Google delivery failed").slice(0, 1000) : null
    }).eq("event_id", event.event_id).neq("status", "Sent");
  if (updateError) return NextResponse.json({ error: "Unable to update event" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
