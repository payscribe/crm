import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

// Settings are passed as [name, value] so a misconfigured deployment reports
// which variable names are missing, never their values.
function verifyScriptCredentials(
  request: Request,
  [secretName, secret]: [string, string | undefined],
  [mailboxName, mailbox]: [string, string | undefined]
) {
  const expectedSecret = secret?.trim();
  const expectedMailbox = mailbox?.trim().toLowerCase();
  if (!expectedSecret || !expectedMailbox) {
    const missing = [!expectedSecret && secretName, !expectedMailbox && mailboxName].filter(Boolean);
    return NextResponse.json(
      { error: `Google email integration is not configured: ${missing.join(", ")} not set` },
      { status: 503 }
    );
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
    ["INBOUND_EMAIL_WEBHOOK_SECRET", process.env.INBOUND_EMAIL_WEBHOOK_SECRET],
    ["GOOGLE_EMAIL_MAILBOX", process.env.GOOGLE_EMAIL_MAILBOX]
  );
}

// The lead history script runs on the shared sales mailbox, which is
// configured separately from the support mailbox used for tickets.
export function verifyLeadEmailSyncRequest(request: Request) {
  return verifyScriptCredentials(
    request,
    ["LEAD_EMAIL_SYNC_SECRET", process.env.LEAD_EMAIL_SYNC_SECRET],
    ["LEAD_EMAIL_MAILBOX", process.env.LEAD_EMAIL_MAILBOX]
  );
}
