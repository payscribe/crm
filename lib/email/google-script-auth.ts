import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export function verifyGoogleScriptRequest(request: Request) {
  if (process.env.EMAIL_PROVIDER !== "google_apps_script") {
    return NextResponse.json({ error: "Google email integration is disabled" }, { status: 409 });
  }
  const secret = process.env.INBOUND_EMAIL_WEBHOOK_SECRET?.trim();
  const expectedMailbox = process.env.GOOGLE_EMAIL_MAILBOX?.trim().toLowerCase();
  if (!secret || !expectedMailbox) {
    return NextResponse.json({ error: "Google email integration is not configured" }, { status: 503 });
  }
  const providedMailbox = request.headers.get("x-crm-mailbox")?.trim().toLowerCase();
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (providedMailbox !== expectedMailbox) {
    return NextResponse.json({ error: "Unexpected mailbox" }, { status: 403 });
  }
  const expected = Buffer.from(secret);
  const actual = Buffer.from(token);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
