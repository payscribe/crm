// Paste into a script owned by the mailbox that receives support email.
// Set Script Properties: CRM_BASE_URL, CRM_SECRET, MAILBOX_EMAIL,
// INBOUND_QUERY, INBOUND_START_AT.
// During testing, also set TEST_RECIPIENT in both Apps Script and the CRM's
// GOOGLE_EMAIL_TEST_RECIPIENT. Use an external address to test inbound mail:
// the Postmark rules ignore @payscribe.co senders.
const THREAD_PAGE_SIZE = 50;
const MAX_THREAD_PAGES = 5;
const MAX_MESSAGES_PER_RUN = 50;

function crmSettings() {
  const properties = PropertiesService.getScriptProperties();
  const baseUrl = properties.getProperty("CRM_BASE_URL");
  const secret = properties.getProperty("CRM_SECRET");
  const mailbox = properties.getProperty("MAILBOX_EMAIL");
  const inboundQuery = properties.getProperty("INBOUND_QUERY");
  const inboundStartAt = properties.getProperty("INBOUND_START_AT");
  if (!baseUrl || !secret || !mailbox || !inboundQuery ||
      !inboundStartAt || isNaN(new Date(inboundStartAt).getTime())) {
    throw new Error("Set CRM_BASE_URL, CRM_SECRET, MAILBOX_EMAIL, INBOUND_QUERY and INBOUND_START_AT in Script Properties.");
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), secret, mailbox: mailbox.toLowerCase(),
    inboundQuery, inboundStartAt: new Date(inboundStartAt).getTime(),
    testRecipient: properties.getProperty("TEST_RECIPIENT") };
}

function crmRequest(path, method, payload) {
  const settings = crmSettings();
  const response = UrlFetchApp.fetch(settings.baseUrl + path, {
    method,
    contentType: "application/json",
    headers: { Authorization: "Bearer " + settings.secret, "X-CRM-Mailbox": settings.mailbox },
    payload: payload ? JSON.stringify(payload) : undefined,
    muteHttpExceptions: true
  });
  const text = response.getContentText();
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    throw new Error(path + " returned " + response.getResponseCode() + ": " + text);
  }
  return JSON.parse(text);
}

function withScriptLock(work) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try { work(); } finally { lock.releaseLock(); }
}

function processInboundTickets() {
  withScriptLock(function () {
    const settings = crmSettings();
    const properties = PropertiesService.getScriptProperties();
    let attempted = 0;
    for (let page = 0; page < MAX_THREAD_PAGES && attempted < MAX_MESSAGES_PER_RUN; page++) {
      const threads = GmailApp.search(settings.inboundQuery, page * THREAD_PAGE_SIZE, THREAD_PAGE_SIZE);
      if (threads.length === 0) break;
      for (const thread of threads) {
        for (const message of thread.getMessages()) {
          if (attempted >= MAX_MESSAGES_PER_RUN) break;
          // Read status is not a processing marker; staff can open mail freely.
          if (!message.isInInbox() || message.isDraft()) continue;
          if (message.getDate().getTime() < settings.inboundStartAt) continue;
          const marker = "inbound_" + message.getId();
          if (properties.getProperty(marker)) continue;
          attempted++;
          const headers = ["Auto-Submitted", "Precedence", "X-Autoreply",
            "X-Auto-Response-Suppress", "List-Id", "List-Unsubscribe", "Content-Type",
            "In-Reply-To"].map(function (name) {
              return { Name: name, Value: message.getHeader(name) || "" };
            });
          try {
            crmRequest("/api/inbound-email/google-apps-script", "post", {
              emailId: message.getId(), threadId: thread.getId(),
              from: message.getFrom(), replyTo: message.getReplyTo(), to: message.getTo(),
              subject: message.getSubject(), body: message.getPlainBody(),
              htmlBody: message.getBody(), date: message.getDate().toISOString(), headers
            });
            properties.setProperty(marker, new Date().toISOString());
          } catch (error) {
            Logger.log("Inbound " + message.getId() + ": " + error);
          }
        }
      }
      if (threads.length < THREAD_PAGE_SIZE) break;
    }
  });
}

function processOutboundTicketEmails() {
  withScriptLock(function () {
    const settings = crmSettings();
    if (MailApp.getRemainingDailyQuota() < 1) {
      Logger.log("Google sending quota exhausted; outbound queue left intact.");
      return;
    }
    const properties = PropertiesService.getScriptProperties();
    const events = crmRequest("/api/outbound-email/google-apps-script/pending", "get").events || [];
    for (const event of events) {
      if (MailApp.getRemainingDailyQuota() < 1) break;
      const marker = "outbound_" + event.event_id;
      const attemptsMarker = "attempts_" + event.event_id;
      if (!properties.getProperty(marker) &&
          Number(properties.getProperty(attemptsMarker) || 0) >= 5) continue;
      try {
        if (!properties.getProperty(marker)) {
          if (settings.testRecipient &&
              event.recipient_email.toLowerCase() !== settings.testRecipient.toLowerCase()) {
            throw new Error("Test recipient does not match CRM configuration");
          }
          sendTicketEmail(event, settings);
          // Keep a local receipt when the CRM acknowledgement fails.
          properties.setProperty(marker, new Date().toISOString());
        }
        crmRequest("/api/outbound-email/google-apps-script/mark-sent", "post",
          { eventId: event.event_id, status: "Sent" });
        properties.deleteProperty(attemptsMarker);
      } catch (error) {
        Logger.log("Outbound " + event.event_id + ": " + error);
        // If Gmail already accepted the message, leave it for acknowledgement
        // on the next run; reporting Failed would risk a duplicate send.
        if (properties.getProperty(marker)) continue;
        properties.setProperty(attemptsMarker,
          String(Number(properties.getProperty(attemptsMarker) || 0) + 1));
        try {
          crmRequest("/api/outbound-email/google-apps-script/mark-sent", "post",
            { eventId: event.event_id, status: "Failed", errorMessage: String(error) });
        } catch (reportError) {
          Logger.log("Could not record failure for " + event.event_id + ": " + reportError);
        }
      }
    }
  });
}

function sendTicketEmail(event, settings) {
  const options = event.body_html ? { htmlBody: event.body_html } : {};
  const threadId = String(event.gmail_thread_id || "");
  if (!settings.testRecipient && threadId && threadId.indexOf("manual:") !== 0) {
    const thread = GmailApp.getThreadById(threadId);
    if (thread) {
      const messages = thread.getMessages();
      for (let index = messages.length - 1; index >= 0; index--) {
        const sender = messages[index].getFrom().toLowerCase();
        const replyTo = messages[index].getReplyTo().toLowerCase();
        if (sender.indexOf(event.recipient_email.toLowerCase()) >= 0 ||
            replyTo.indexOf(event.recipient_email.toLowerCase()) >= 0) {
          messages[index].reply(event.body_text, options);
          return;
        }
      }
    }
  }
  GmailApp.sendEmail(event.recipient_email, event.subject, event.body_text, options);
}

function processSupportEmail() {
  processInboundTickets();
  processOutboundTicketEmails();
}
