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
  ticketId,
  resolution
}: {
  customerName: string | null;
  ticketId: string;
  resolution: string;
}) {
  const greeting = customerName ? `Hello ${customerName},` : "Hello,";
  const htmlGreeting = customerName
    ? `Hello ${escapeHtml(customerName)},`
    : "Hello,";
  const textContent = `${greeting}

Your ticket ${ticketId} has been closed.

Resolution:
${resolution}

Best regards,
Payscribe Support`;

  return {
    subject: `Ticket closed: ${ticketId}`,
    textContent,
    htmlContent: `
      <p>${htmlGreeting}</p>
      <p>Your ticket <strong>${ticketId}</strong> has been closed.</p>
      <p><strong>Resolution:</strong></p>
      <p>${escapeHtml(resolution).replace(/\n/g, "<br/>")}</p>
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
