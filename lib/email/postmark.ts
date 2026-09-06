type SendEmailInput = {
  to: {
    email: string;
    name?: string | null;
  };
  subject: string;
  htmlContent: string;
  textContent: string;
  replyTo?: string | null;
  messageStream?: string;
  headers?: Array<{ Name: string; Value: string }>;
};

type PostmarkSendResponse = {
  To: string;
  SubmittedAt: string;
  MessageID: string;
  ErrorCode: number;
  Message: string;
};

export async function sendTransactionalEmail({
  to,
  subject,
  htmlContent,
  textContent,
  replyTo,
  messageStream = "outbound",
  headers
}: SendEmailInput) {
  const apiKey = process.env.POSTMARK_SERVER_TOKEN;
  const fromEmail = process.env.POSTMARK_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    throw new Error("Missing Postmark environment variables.");
  }

  const response = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": apiKey
    },
    body: JSON.stringify({
      From: fromEmail,
      To: to.name ? `${to.name} <${to.email}>` : to.email,
      Subject: subject,
      HtmlBody: htmlContent,
      TextBody: textContent,
      ReplyTo: replyTo || fromEmail,
      MessageStream: messageStream,
      Headers: headers
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Postmark email failed: ${response.status} ${body}`);
  }

  const result = await response.json() as PostmarkSendResponse;
  return result;
}

export function ticketCreatedEmail({
  customerName,
  ticketId,
  subject
}: {
  customerName: string | null;
  ticketId: string;
  subject: string;
}) {
  const greeting = customerName ? `Hello ${customerName},` : "Hello,";
  const htmlGreeting = customerName
    ? `Hello ${escapeHtml(customerName)},`
    : "Hello,";
  const textContent = `${greeting}

We have received your message and created ticket ${ticketId}.

Subject: ${subject}

Our team will review it and get back to you shortly.

Best regards,
Payscribe Support`;

  return {
    subject: `Ticket received: ${ticketId}`,
    textContent,
    htmlContent: `
      <p>${htmlGreeting}</p>
      <p>We have received your message and created ticket <strong>${ticketId}</strong>.</p>
      <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
      <p>Our team will review it and get back to you shortly.</p>
      <p>Best regards,<br/>Payscribe Support</p>
    `
  };
}

export function ticketClosedEmail({
  customerName,
  ticketId
}: {
  customerName: string | null;
  ticketId: string;
}) {
  const greeting = customerName ? `Hello ${customerName},` : "Hello,";
  const htmlGreeting = customerName
    ? `Hello ${escapeHtml(customerName)},`
    : "Hello,";
  const textContent = `${greeting}

Your ticket ${ticketId} has been closed.

Best regards,
Payscribe Support`;

  return {
    subject: `Ticket closed: ${ticketId}`,
    textContent,
    htmlContent: `
      <p>${htmlGreeting}</p>
      <p>Your ticket <strong>${ticketId}</strong> has been closed.</p>
      <p>Best regards,<br/>Payscribe Support</p>
    `
  };
}

export function ticketReplyEmail({
  agentName,
  customerName,
  message,
  subject,
  ticketId
}: {
  agentName: string;
  customerName: string | null;
  message: string;
  subject: string;
  ticketId: string;
}) {
  const greeting = customerName ? `Hello ${customerName},` : "Hello,";
  const htmlGreeting = customerName
    ? `Hello ${escapeHtml(customerName)},`
    : "Hello,";

  return {
    subject: `Re: [${ticketId}] ${subject}`,
    textContent: `${greeting}\n\n${agentName} from Payscribe Support replied to your ticket:\n\n${message}\n\nYou can continue the conversation through the same support channel.\n\nBest regards,\nPayscribe Support`,
    htmlContent: `
      <p>${htmlGreeting}</p>
      <p><strong>${escapeHtml(agentName)}</strong> from Payscribe Support replied to ticket <strong>${escapeHtml(ticketId)}</strong>:</p>
      <blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #0f766e;background:#f8fafc;white-space:pre-wrap">${escapeHtml(message)}</blockquote>
      <p>You can continue the conversation through the same support channel.</p>
      <p>Best regards,<br/>Payscribe Support</p>
    `
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
