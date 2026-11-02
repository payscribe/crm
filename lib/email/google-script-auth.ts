import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

function verifyScriptCredentials(
  request: Request,
  secret: string | undefined,
  mailbox: string | undefined
) {
  const expectedSecret = secret?.trim();
  const expectedMailbox = mailbox?.trim().toLowerCase();
  if (!expectedSecret || !expectedMailbox) {
    return NextResponse.json({ error: "Google email integration is not configured" }, { status: 503 });
  }
  const providedMailbox = request.headers.get("x-crm-mailbox")?.trim().toLowerCase();
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (providedMailbox !== expectedMailbox) {
    return NextResponse.json({ error: "Unexpected mailbox" }, { status: 403 });
  }
  const expected = Buffer.from(expectedSecret);
  const actual = Buffer.from(token);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export function verifyGoogleScriptRequest(request: Request) {
  if (process.env.EMAIL_PROVIDER !== "google_apps_script") {
    return NextResponse.json({ error: "Google email integration is disabled" }, { status: 409 });
  }
  return verifyScriptCredentials(
    request,
    process.env.INBOUND_EMAIL_WEBHOOK_SECRET,
    process.env.GOOGLE_EMAIL_MAILBOX
  );
}

// The lead history script runs on the shared sales mailbox, which is
// configured separately from the support mailbox used for tickets.
export function verifyLeadEmailSyncRequest(request: Request) {
  return verifyScriptCredentials(
    request,
    process.env.LEAD_EMAIL_SYNC_SECRET,
    process.env.LEAD_EMAIL_MAILBOX
  );
}
