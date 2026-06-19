type SendTransactionalEmailInput = {
  to: {
    email: string;
    name?: string | null;
  };
  subject: string;
  htmlContent: string;
  textContent: string;
};

export async function sendTransactionalEmail({
  to,
  subject,
  htmlContent,
  textContent
}: SendTransactionalEmailInput) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME ?? "Payscribe";

  if (!apiKey || !senderEmail) {
    throw new Error("Missing Brevo email environment variables.");
  }

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
      accept: "application/json"
    },
    body: JSON.stringify({
      sender: {
        email: senderEmail,
        name: senderName
      },
      to: [
        {
          email: to.email,
          name: to.name || undefined
        }
      ],
      subject,
      htmlContent,
      textContent
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Brevo email failed: ${response.status} ${body}`);
  }
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
  const textContent = `${greeting}\n\nWe have received your message and created ticket ${ticketId}.\n\nSubject: ${subject}\n\nOur team will review it and get back to you shortly.\n\nBest regards,\nPayscribe Support`;

  return {
    subject: `Ticket received: ${ticketId}`,
    textContent,
    htmlContent: `
      <p>${greeting}</p>
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
  const textContent = `${greeting}\n\nYour ticket ${ticketId} has been closed.\n\nResolution:\n${resolution}\n\nBest regards,\nPayscribe Support`;

  return {
    subject: `Ticket closed: ${ticketId}`,
    textContent,
    htmlContent: `
      <p>${greeting}</p>
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
