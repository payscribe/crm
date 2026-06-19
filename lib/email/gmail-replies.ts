export function ticketCreatedGmailReply({
  customerName,
  ticketId,
  subject
}: {
  customerName: string | null;
  ticketId: string;
  subject: string;
}) {
  const greeting = customerName ? `Hello ${customerName},` : "Hello,";

  return {
    subject: `Ticket received: ${ticketId}`,
    bodyText: `${greeting}

Thank you for reaching out to Payscribe Support.

We have received your message and created ticket ${ticketId}.

Subject: ${subject}

Our team will review it and get back to you shortly.

Best regards,
Payscribe Support`
  };
}

export function ticketClosedGmailReply({
  customerName,
  ticketId,
  resolution
}: {
  customerName: string | null;
  ticketId: string;
  resolution: string;
}) {
  const greeting = customerName ? `Hello ${customerName},` : "Hello,";

  return {
    subject: `Ticket closed: ${ticketId}`,
    bodyText: `${greeting}

Your ticket ${ticketId} has been closed.

Resolution:
${resolution}

Best regards,
Payscribe Support`
  };
}
