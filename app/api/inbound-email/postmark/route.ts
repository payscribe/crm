import { processInboundTicket, type PostmarkInboundWebhookPayload } from "@/lib/email/inbound-ticket";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  if (process.env.EMAIL_PROVIDER === "google_apps_script") {
    return NextResponse.json({ ignored: true, reason: "Postmark inbound is disabled" });
  }
  const configuredSecret = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
  const { searchParams } = new URL(request.url);
  if (!configuredSecret || searchParams.get("secret") !== configuredSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let payload: PostmarkInboundWebhookPayload;
  try {
    payload = (await request.json()) as PostmarkInboundWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }
  return processInboundTicket(payload, "postmark");
}
