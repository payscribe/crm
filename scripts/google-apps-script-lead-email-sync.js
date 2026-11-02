// Paste into a script owned by the shared sales mailbox.
// Set Script Properties: CRM_BASE_URL, CRM_SECRET, MAILBOX_EMAIL.
// Optional: HISTORY_DAYS (default 90), how far back to import a lead's past emails.
// Run syncLeadEmails once to grant permissions, then add a five-minute
// time-driven trigger for syncLeadEmails.
//
// Each run sends the CRM new emails to or from any lead's address (posted to
// the lead's Slack thread), then imports past emails for leads whose address
// is new or changed (logged without posting to Slack).
const LEAD_SYNC_CURSOR_PROPERTY = "LEAD_SYNC_CURSOR";
const SYNC_OVERLAP_MS = 10 * 60 * 1000;
const RUN_TIME_BUDGET_MS = 4 * 60 * 1000;
const THREAD_PAGE_SIZE = 50;
const MAX_THREAD_PAGES = 10;
const POST_BATCH_SIZE = 50;
const HISTORY_LEADS_PER_QUERY = 5;
const MAX_BODY_LENGTH = 5000;
const CRM_MAX_ATTEMPTS = 3;
const SEARCH_EXCLUSIONS = "in:anywhere -in:spam -in:trash -in:drafts -in:chats";

function crmSettings() {
  const properties = PropertiesService.getScriptProperties();
  const baseUrl = properties.getProperty("CRM_BASE_URL");
  const secret = properties.getProperty("CRM_SECRET");
  const mailbox = properties.getProperty("MAILBOX_EMAIL");
  const historyDays = Number(properties.getProperty("HISTORY_DAYS") || 90);
  if (!baseUrl || !secret || !mailbox || !(historyDays > 0)) {
    throw new Error("Set CRM_BASE_URL, CRM_SECRET and MAILBOX_EMAIL in Script Properties.");
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), secret, mailbox: mailbox.toLowerCase(),
    historyDays: Math.floor(historyDays) };
}

function crmRequest(path, method, payload) {
  const settings = crmSettings();
  let lastError = null;
  for (let attempt = 1; attempt <= CRM_MAX_ATTEMPTS; attempt++) {
    try {
      const response = UrlFetchApp.fetch(settings.baseUrl + path, {
        method,
        contentType: "application/json",
        headers: { Authorization: "Bearer " + settings.secret, "X-CRM-Mailbox": settings.mailbox,
          "Cache-Control": "no-cache" },
        payload: payload ? JSON.stringify(payload) : undefined,
        muteHttpExceptions: true
      });
      const text = response.getContentText();
      const status = response.getResponseCode();
      if (status >= 200 && status < 300) {
        return JSON.parse(text);
      }
      const error = new Error(path + " returned " + status + ": " + text);
      if (status < 500 || attempt === CRM_MAX_ATTEMPTS) {
        throw error;
      }
      lastError = error;
    } catch (error) {
      lastError = error;
      if (!isRetryableCrmError(error) || attempt === CRM_MAX_ATTEMPTS) {
        throw error;
      }
    }
    Utilities.sleep(1000 * attempt);
  }
  throw lastError;
}

function isRetryableCrmError(error) {
  const message = String(error || "").toLowerCase();
  return message.indexOf("address unavailable") >= 0 ||
    message.indexOf("server error") >= 0 ||
    message.indexOf("returned 5") >= 0 ||
    message.indexOf("timed out") >= 0 ||
    message.indexOf("dns") >= 0;
}

function withScriptLock(work) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    Logger.log("Lead email sync skipped: another run holds the script lock.");
    return;
  }
  try { work(); } finally { lock.releaseLock(); }
}

function emailAddresses(header) {
  const matches = String(header || "").match(/[^\s<>,;:"'()[\]]+@[^\s<>,;:"'()[\]]+\.[^\s<>,;:"'()[\]]+/g) || [];
  return matches.map(function (address) { return address.toLowerCase(); });
}

function messageParticipants(message) {
  return emailAddresses(message.getFrom())
    .concat(emailAddresses(message.getTo()), emailAddresses(message.getCc()));
}

function toSyncedEmail(message, thread, notify) {
  const headerId = String(message.getHeader("Message-ID") || "").trim();
  return {
    messageId: headerId || "gmail:" + message.getId(),
    gmailMessageId: message.getId(),
    threadId: thread.getId(),
    from: message.getFrom(),
    to: message.getTo(),
    cc: message.getCc(),
    subject: message.getSubject(),
    date: message.getDate().toISOString(),
    body: String(message.getPlainBody() || "").slice(0, MAX_BODY_LENGTH),
    notify: notify
  };
}

// Collects messages from threads matching the query that involve a watched
// address. Returns { messages, complete } where complete is false if the
// search had more pages than one run reads.
function collectMessages(query, watched, notify, minDate) {
  const messages = [];
  const seen = {};
  for (let page = 0; page < MAX_THREAD_PAGES; page++) {
    const threads = GmailApp.search(query, page * THREAD_PAGE_SIZE, THREAD_PAGE_SIZE);
    for (let t = 0; t < threads.length; t++) {
      const threadMessages = threads[t].getMessages();
      for (let m = 0; m < threadMessages.length; m++) {
        const message = threadMessages[m];
        if (message.isDraft() || seen[message.getId()]) continue;
        if (minDate && message.getDate().getTime() < minDate) continue;
        const involvesLead = messageParticipants(message).some(function (address) {
          return watched[address] === true;
        });
        if (!involvesLead) continue;
        seen[message.getId()] = true;
        messages.push(toSyncedEmail(message, threads[t], notify));
      }
    }
    if (threads.length < THREAD_PAGE_SIZE) return { messages, complete: true };
  }
  return { messages, complete: false };
}

function postToCrm(messages, completedBackfills) {
  if (messages.length === 0 && completedBackfills.length === 0) return;
  for (let start = 0; start < Math.max(messages.length, 1); start += POST_BATCH_SIZE) {
    const batch = messages.slice(start, start + POST_BATCH_SIZE);
    const isLast = start + POST_BATCH_SIZE >= messages.length;
    const result = crmRequest("/api/lead-email/google-apps-script/messages", "post", {
      messages: batch,
      // Mark history imported only once every message for it is stored.
      completedBackfills: isLast ? completedBackfills : []
    });
    Logger.log("CRM logged " + result.logged + " lead emails (" + result.duplicates +
      " already logged, " + result.notified + " posted to Slack).");
  }
}

function syncRecentEmails(leads, runStartedAt) {
  const properties = PropertiesService.getScriptProperties();
  const storedCursor = Number(properties.getProperty(LEAD_SYNC_CURSOR_PROPERTY));
  // First run: start now. Older mail arrives through the history import.
  const cursor = storedCursor > 0 ? storedCursor : runStartedAt;
  const since = cursor - SYNC_OVERLAP_MS;
  const watched = {};
  leads.forEach(function (lead) { watched[lead.email] = true; });

  if (leads.length > 0) {
    const query = SEARCH_EXCLUSIONS + " after:" + Math.floor(since / 1000);
    const result = collectMessages(query, watched, true, since);
    if (!result.complete) {
      Logger.log("Recent sync read the maximum number of threads; some messages may wait for the next run.");
    }
    postToCrm(result.messages, []);
  }
  properties.setProperty(LEAD_SYNC_CURSOR_PROPERTY, String(runStartedAt));
}

function importLeadHistory(leads, settings, runStartedAt) {
  const pending = leads.filter(function (lead) { return !lead.historySynced; });
  for (let start = 0; start < pending.length; start += HISTORY_LEADS_PER_QUERY) {
    if (Date.now() - runStartedAt > RUN_TIME_BUDGET_MS) {
      Logger.log("History import paused for time; " + (pending.length - start) + " leads left for later runs.");
      return;
    }
    const chunk = pending.slice(start, start + HISTORY_LEADS_PER_QUERY);
    const watched = {};
    const terms = [];
    chunk.forEach(function (lead) {
      watched[lead.email] = true;
      terms.push("from:" + lead.email, "to:" + lead.email, "cc:" + lead.email);
    });
    const query = SEARCH_EXCLUSIONS + " newer_than:" + settings.historyDays + "d {" + terms.join(" ") + "}";
    const result = collectMessages(query, watched, false, null);
    if (!result.complete) {
      Logger.log("History import for " + chunk.length + " leads read the maximum number of threads; older emails were skipped.");
    }
    postToCrm(result.messages, chunk.map(function (lead) {
      return { leadId: lead.leadId, email: lead.email };
    }));
  }
}

function syncLeadEmails() {
  withScriptLock(function () {
    const settings = crmSettings();
    const runStartedAt = Date.now();
    const leads = crmRequest("/api/lead-email/google-apps-script/leads?_ts=" + runStartedAt, "get").leads || [];
    syncRecentEmails(leads, runStartedAt);
    importLeadHistory(leads, settings, runStartedAt);
  });
}
