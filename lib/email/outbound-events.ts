import { ticketClosedEmail, ticketCreatedEmail, sendTransactionalEmail } from "@/lib/email/postmark";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

type QueueTicketEmailInput = {
  customerEmail: string | null;
  customerName: string | null;
  gmailThreadId: string | null;
  supabase: SupabaseAdmin;
  ticketId: string;
};

type QueueTicketOpenedEmailInput = QueueTicketEmailInput & {
  subject: string;
};

type QueueTicketClosedEmailInput = QueueTicketEmailInput & {
  resolution: string;
};

export async function queueTicketOpenedEmail({
  customerEmail,
  customerName,
  gmailThreadId,
  subject,
  supabase,
  ticketId
}: QueueTicketOpenedEmailInput) {
  if (!customerEmail) {
    return false;
  }

  const email = ticketCreatedEmail({
    customerName,
    ticketId,
    subject
  });

  return queueTicketEmail({
    bodyText: email.textContent,
    bodyHtml: email.htmlContent,
    customerEmail,
    customerName,
    gmailThreadId,
    notificationType: "Ticket Opened",
    subject: email.subject,
    supabase,
    ticketId
  });
}

export async function queueTicketClosedEmail({
  customerEmail,
  customerName,
  gmailThreadId,
  supabase,
  ticketId
}: Omit<QueueTicketClosedEmailInput, 'resolution'>) {
  if (!customerEmail) {
    return false;
  }

  const email = ticketClosedEmail({
    customerName,
    ticketId
  });

  return queueTicketEmail({
    bodyText: email.textContent,
    bodyHtml: email.htmlContent,
    customerEmail,
    customerName,
    gmailThreadId,
    notificationType: "Ticket Closed",
    subject: email.subject,
    supabase,
    ticketId
  });
}

async function queueTicketEmail({
  bodyText,
  bodyHtml,
  customerEmail,
  customerName,
  gmailThreadId,
  notificationType,
  subject,
  supabase,
  ticketId
}: {
  bodyText: string;
  bodyHtml: string;
  customerEmail: string;
  customerName: string | null;
  gmailThreadId: string | null;
  notificationType: "Ticket Opened" | "Ticket Closed";
  subject: string;
  supabase: SupabaseAdmin;
  ticketId: string;
}) {
  let eventId: string | null = null;

  // First check if there's an existing event
  const { data: existingEvent } = await supabase
    .from("outbound_email_events")
    .select("event_id")
    .eq("ticket_id", ticketId)
    .eq("notification_type", notificationType)
    .maybeSingle<{ event_id: string }>();

  if (existingEvent) {
    // Update existing event
    const { data, error } = await supabase
      .from("outbound_email_events")
      .update({
        body_text: bodyText,
        body_html: bodyHtml,
        error_message: null,
        gmail_thread_id: gmailThreadId,
        recipient_email: customerEmail,
        recipient_name: customerName,
        sent_at: null,
        status: "Pending",
        provider: "postmark",
        subject
      })
      .eq("event_id", existingEvent.event_id)
      .select("event_id")
      .single<{ event_id: string }>();

    if (error) {
      return false;
    }
    eventId = data.event_id;
  } else {
    // Create new event
    const { data, error } = await supabase
      .from("outbound_email_events")
      .insert({
        body_text: bodyText,
        body_html: bodyHtml,
        gmail_thread_id: gmailThreadId,
        notification_type: notificationType,
        recipient_email: customerEmail,
        recipient_name: customerName,
        status: "Pending",
        provider: "postmark",
        subject,
        ticket_id: ticketId
      })
      .select("event_id")
      .single<{ event_id: string }>();

    if (error) {
      return false;
    }
    eventId = data.event_id;
  }

  // Now try to send the email immediately
  try {
    const result = await sendTransactionalEmail({
      to: {
        email: customerEmail,
        name: customerName
      },
      subject,
      textContent: bodyText,
      htmlContent: bodyHtml || bodyText.replace(/\n/g, "<br/>")
    });

    // Update the event to Sent
    await supabase
      .from("outbound_email_events")
      .update({
        status: "Sent",
        sent_at: new Date().toISOString(),
        postmark_message_id: result.MessageID,
        error_message: null
      })
      .eq("event_id", eventId);

    // Also update the ticket's customer_notified_at or closure_notified_at
    const ticketUpdate =
      notificationType === "Ticket Opened"
        ? { customer_notified_at: new Date().toISOString() }
        : { closure_notified_at: new Date().toISOString() };

    await supabase
      .from("tickets")
      .update(ticketUpdate)
      .eq("ticket_id", ticketId);

    return true;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown Postmark error";

    await supabase
      .from("outbound_email_events")
      .update({
        status: "Failed",
        error_message: errorMessage
      })
      .eq("event_id", eventId);

    return false;
  }
}
