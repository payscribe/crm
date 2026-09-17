import { processInboundTicket, type PostmarkInboundWebhookPayload } from "@/lib/email/inbound-ticket";
import { verifyGoogleScriptRequest } from "@/lib/email/google-script-auth";
import { NextResponse } from "next/server";

type GoogleMessage = {
  emailId?: unknown;
  threadId?: unknown;
  from?: unknown;
  replyTo?: unknown;
  to?: unknown;
  subject?: unknown;
  body?: unknown;
  htmlBody?: unknown;
  date?: unknown;
  headers?: unknown;
};

function address(value: string) {
  const match = value.match(/^(.*?)<([^>]+)>$/);
  return match
    ? { Email: match[2].trim(), Name: match[1].trim().replace(/^"|"$/g, "") }
    : { Email: value.trim(), Name: "" };
}

export async function POST(request: Request) {
  const rejected = verifyGoogleScriptRequest(request);
  if (rejected) return rejected;

  let message: GoogleMessage;
  try {
    message = (await request.json()) as GoogleMessage;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }
  if (!message || typeof message.emailId !== "string" ||
      typeof message.threadId !== "string" || typeof message.from !== "string") {
    return NextResponse.json({ error: "Message ID, thread ID and sender are required" }, { status: 400 });
  }
  const headers = Array.isArray(message.headers)
    ? message.headers.filter((entry): entry is { Name: string; Value: string } =>
        Boolean(entry && typeof entry.Name === "string" && typeof entry.Value === "string"))
    : [];
  if (typeof message.replyTo === "string" && message.replyTo.trim()) {
    headers.push({ Name: "Reply-To", Value: message.replyTo });
  }
  const sender = address(message.from);
  const payload: PostmarkInboundWebhookPayload = {
    From: message.from,
    FromFull: sender,
    To: typeof message.to === "string" ? message.to : "",
    ToFull: [], Cc: "", CcFull: [],
    Subject: typeof message.subject === "string" ? message.subject : "",
    Date: typeof message.date === "string" ? message.date : "",
    MailboxHash: "",
    TextBody: typeof message.body === "string" ? message.body : "",
    HtmlBody: typeof message.htmlBody === "string" ? message.htmlBody : "",
    MessageID: message.emailId,
    MessageStream: "inbound",
    Headers: headers
  };
  return processInboundTicket(payload, "google_apps_script", message.threadId);
}
