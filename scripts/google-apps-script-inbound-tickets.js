const CRM_WEBHOOK_URL = "https://YOUR_APP_DOMAIN/api/inbound-email/google-apps-script";
const CRM_PENDING_REPLIES_URL = "https://YOUR_APP_DOMAIN/api/outbound-email/google-apps-script/pending";
const CRM_MARK_REPLY_SENT_URL = "https://YOUR_APP_DOMAIN/api/outbound-email/google-apps-script/mark-sent";
const SECRET_TOKEN = "PASTE_THE_SAME_VALUE_AS_INBOUND_EMAIL_WEBHOOK_SECRET";
const MAX_THREADS_PER_RUN = 20;
const INBOUND_SEARCH_QUERY = "in:inbox is:unread newer_than:14d";

function processInboundTickets() {
  const threads = GmailApp.search(INBOUND_SEARCH_QUERY, 0, MAX_THREADS_PER_RUN);

  for (const thread of threads) {
    const messages = thread.getMessages();

    for (const message of messages) {
      if (!message.isUnread()) {
        continue;
      }

      const payload = {
        emailId: message.getId(),
        threadId: thread.getId(),
        from: message.getFrom(),
        subject: message.getSubject(),
        body: message.getPlainBody(),
        date: message.getDate().toISOString()
      };

      const result = forwardToCRM(payload);

      if (result.success) {
        message.markRead();
        Logger.log(`CRM accepted ${payload.emailId} as ticket ${result.ticketId}`);
      } else {
        Logger.log(`CRM failed for ${payload.emailId}: ${result.error}`);
      }
    }
  }
}

function forwardToCRM(payload) {
  const options = {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + SECRET_TOKEN
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(CRM_WEBHOOK_URL, options);
    const status = response.getResponseCode();
    const body = response.getContentText();

    if (status >= 200 && status < 300) {
      const parsed = JSON.parse(body);
      Logger.log(`CRM response for ${payload.emailId}: ${body}`);
      return {
        success: true,
        ticketId: parsed.ticketId,
        queuedCustomerReply: parsed.queuedCustomerReply
      };
    }

    return {
      success: false,
      error: `${status}: ${body}`
    };
  } catch (error) {
    return {
      success: false,
      error: error.toString()
    };
  }
}

function processOutboundReplies() {
  const pending = fetchPendingOutboundReplies();

  if (pending.length === 0) {
    Logger.log("No pending outbound Gmail replies.");
    return;
  }

  for (const event of pending) {
    try {
      if (String(event.gmail_thread_id || "").indexOf("manual:") === 0) {
        GmailApp.sendEmail(event.recipient_email, event.subject, event.body_text);
        markOutboundReply(event.event_id, "Sent", "");
        Logger.log(`Sent ${event.notification_type || "ticket"} email for ${event.ticket_id}`);
        continue;
      }

      const thread = GmailApp.getThreadById(event.gmail_thread_id);
      if (!thread) {
        markOutboundReply(event.event_id, "Failed", "Gmail thread not found");
        continue;
      }

      thread.reply(event.body_text);
      markOutboundReply(event.event_id, "Sent", "");
      Logger.log(`Sent ${event.notification_type || "ticket"} reply for ${event.ticket_id}`);
    } catch (error) {
      markOutboundReply(event.event_id, "Failed", error.toString());
      Logger.log(`Failed ${event.notification_type || "ticket"} reply for ${event.ticket_id}: ${error}`);
    }
  }
}

function fetchPendingOutboundReplies() {
  const options = {
    method: "get",
    headers: {
      Authorization: "Bearer " + SECRET_TOKEN
    },
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(CRM_PENDING_REPLIES_URL, options);
  const status = response.getResponseCode();
  const body = response.getContentText();

  if (status < 200 || status >= 300) {
    Logger.log(`CRM pending replies failed: ${status}: ${body}`);
    return [];
  }

  return JSON.parse(body).events || [];
}

function markOutboundReply(eventId, status, errorMessage) {
  const options = {
    method: "post",
    contentType: "application/json",
    headers: {
      Authorization: "Bearer " + SECRET_TOKEN
    },
    payload: JSON.stringify({
      eventId,
      status,
      errorMessage
    }),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(CRM_MARK_REPLY_SENT_URL, options);

  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    Logger.log(`Failed to mark outbound reply ${eventId}: ${response.getContentText()}`);
  }
}
