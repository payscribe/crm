import { verifyGoogleScriptRequest } from "@/lib/email/google-script-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const rejected = verifyGoogleScriptRequest(request);
  if (rejected) return rejected;
  const supabase = createSupabaseAdminClient();
  const fields = "event_id, ticket_id, recipient_email, subject, body_text, body_html, gmail_thread_id, notification_type";
  const pending = await supabase.from("outbound_email_events")
    .select(fields).eq("provider", "google_apps_script").eq("status", "Pending")
    .order("created_at").limit(10);
  if (pending.error) return NextResponse.json({ error: "Unable to read outbound queue" }, { status: 500 });

  let events = pending.data ?? [];
  if (events.length === 0) {
    const retry = await supabase.from("outbound_email_events")
      .select(fields).eq("provider", "google_apps_script").eq("status", "Failed")
      .lt("updated_at", new Date(Date.now() - 5 * 60_000).toISOString())
      .order("updated_at").limit(10);
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
