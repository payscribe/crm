import { verifyGoogleScriptRequest } from "@/lib/email/google-script-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(request: Request) {
  const rejected = verifyGoogleScriptRequest(request);
  if (rejected) return rejected;
  const ticketId = new URL(request.url).searchParams.get("ticketId")?.trim();
  if (ticketId && (ticketId.length > 80 || !/^[A-Za-z0-9-]+$/.test(ticketId))) {
    return NextResponse.json({ error: "Invalid ticket ID" }, { status: 400 });
  }
  // This queue changes after every acknowledgement; never reuse a cached
  // Supabase GET even when the outer Apps Script request has a unique URL.
  const supabase = createSupabaseAdminClient({ noStore: true });
  const fields = "event_id, ticket_id, recipient_email, subject, body_text, body_html, gmail_thread_id, notification_type";
  let pendingQuery = supabase.from("outbound_email_events")
    .select(fields).eq("provider", "google_apps_script").eq("status", "Pending");
  if (ticketId) pendingQuery = pendingQuery.eq("ticket_id", ticketId);
  const pending = await pendingQuery.order("created_at").limit(10);
  if (pending.error) return NextResponse.json({ error: "Unable to read outbound queue" }, { status: 500 });

  let events = pending.data ?? [];
  if (events.length === 0) {
    let retryQuery = supabase.from("outbound_email_events")
      .select(fields).eq("provider", "google_apps_script").eq("status", "Failed")
      .lt("updated_at", new Date(Date.now() - 5 * 60_000).toISOString());
    if (ticketId) retryQuery = retryQuery.eq("ticket_id", ticketId);
    const retry = await retryQuery.order("updated_at").limit(10);
    if (retry.error) return NextResponse.json({ error: "Unable to read retry queue" }, { status: 500 });
    events = retry.data ?? [];
  }
  const testRecipient = process.env.GOOGLE_EMAIL_TEST_RECIPIENT?.trim();
  return NextResponse.json({
    events: testRecipient
      ? events.map((event) => ({ ...event, recipient_email: testRecipient,
          gmail_thread_id: null, subject: `[CRM TEST] ${event.subject}` }))
      : events
  }, { headers: { "Cache-Control": "no-store" } });
}
