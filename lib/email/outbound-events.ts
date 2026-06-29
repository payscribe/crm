import { ticketClosedEmail, ticketCreatedEmail } from "@/lib/email/postmark";
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
  resolution,
  supabase,
  ticketId
}: QueueTicketClosedEmailInput) {
  if (!customerEmail) {
    return false;
  }

  const email = ticketClosedEmail({
    customerName,
    ticketId,
    resolution
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
  const { data: existingEvent } = await supabase
    .from("outbound_email_events")
    .select("event_id")
    .eq("ticket_id", ticketId)
    .eq("notification_type", notificationType)
    .maybeSingle<{ event_id: string }>();

  if (existingEvent) {
    const { error } = await supabase
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
      .eq("event_id", existingEvent.event_id);

    return !error;
  }

  const { error } = await supabase.from("outbound_email_events").insert({
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
  });

  return !error;
}
