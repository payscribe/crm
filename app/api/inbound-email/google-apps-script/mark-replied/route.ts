import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

type MarkInboundReplyPayload = {
  errorMessage?: string;
  ticketId?: string;
};

export async function POST(request: Request) {
  const unauthorized = verifyRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  let payload: MarkInboundReplyPayload;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!payload.ticketId) {
    return NextResponse.json({ error: "ticketId is required" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  if (payload.errorMessage) {
    await supabase
      .from("inbound_email_events")
      .update({
        processing_status: "ProcessedWithEmailError",
        error_message: payload.errorMessage
      })
      .eq("ticket_id", payload.ticketId);

    return NextResponse.json({ ok: true });
  }

  const notifiedAt = new Date().toISOString();
  const { error } = await supabase
    .from("tickets")
    .update({ customer_notified_at: notifiedAt })
    .eq("ticket_id", payload.ticketId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase
    .from("inbound_email_events")
    .update({
      processing_status: "Processed",
      error_message: null
    })
    .eq("ticket_id", payload.ticketId);

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
