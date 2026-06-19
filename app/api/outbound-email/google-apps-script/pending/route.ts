import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const unauthorized = verifyRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("outbound_email_events")
    .select("event_id, ticket_id, notification_type, recipient_email, recipient_name, gmail_thread_id, subject, body_text")
    .eq("provider", "google_apps_script")
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
        gmail_thread_id: string;
        subject: string;
        body_text: string;
      }>
    >();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: data ?? [] });
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
