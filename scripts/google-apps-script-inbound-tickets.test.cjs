const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "google-apps-script-inbound-tickets.js"), "utf8");

function harness(fetch) {
  const values = new Map([
    ["CRM_BASE_URL", "https://crm.example"], ["CRM_SECRET", "test-secret"],
    ["MAILBOX_EMAIL", "tomiwa@payscribe.co"], ["INBOUND_QUERY", "label:crm-test"],
    ["INBOUND_START_AT", "2026-09-17T09:00:00Z"],
    ["TEST_RECIPIENT", "test@example.com"]
  ]);
  const sends = [];
  const inboxMessage = {
    getId: () => "gmail-1", isInInbox: () => true, isDraft: () => false,
    isUnread: () => false, getHeader: () => "", getFrom: () => "Customer <buyer@example.com>",
    getReplyTo: () => "buyer@example.com", getTo: () => "tomiwa@payscribe.co",
    getSubject: () => "Card issue", getPlainBody: () => "Please help",
    getBody: () => "<p>Please help</p>", getDate: () => new Date("2026-09-17T10:00:00Z")
  };
  const context = {
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (key) => values.get(key) ?? null,
      setProperty: (key, value) => values.set(key, value),
      deleteProperty: (key) => values.delete(key)
    }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    GmailApp: { search: (_query, offset) => offset ? [] : [{
      getId: () => "thread-1", getMessages: () => [inboxMessage]
    }], sendEmail: (...args) => sends.push(args) },
    MailApp: { getRemainingDailyQuota: () => 100 },
    UrlFetchApp: { fetch: fetch },
    Logger: { log: () => {} },
    Date, JSON, String, Number
  };
  vm.runInNewContext(source, context);
  return { context, sends, values };
}

function response(status, body) {
  return { getResponseCode: () => status, getContentText: () => JSON.stringify(body) };
}

test("ingests an already-read message once", () => {
  let inboundCalls = 0;
  const { context } = harness((url) => {
    if (url.endsWith("/inbound-email/google-apps-script")) inboundCalls++;
    return response(200, { ticketId: "T-1" });
  });
  context.processInboundTickets();
  context.processInboundTickets();
  assert.equal(inboundCalls, 1);
});

test("does not import mail from before the configured start time", () => {
  let inboundCalls = 0;
  const { context, values } = harness(() => {
    inboundCalls++;
    return response(200, { ticketId: "T-1" });
  });
  values.set("INBOUND_START_AT", "2026-09-17T11:00:00Z");
  context.processInboundTickets();
  assert.equal(inboundCalls, 0);
});

test("retries acknowledgement without sending the email again", () => {
  let acknowledgementCalls = 0;
  const event = {
    event_id: "e-1", ticket_id: "T-1", recipient_email: "test@example.com",
    subject: "[CRM TEST] Ticket received: T-1", body_text: "Hello", body_html: "<p>Hello</p>",
    gmail_thread_id: null
  };
  const { context, sends } = harness((url) => {
    if (url.includes("/pending?_ts=")) return response(200, { events: [event] });
    if (url.endsWith("/mark-sent")) {
      acknowledgementCalls++;
      return response(acknowledgementCalls === 1 ? 500 : 200, { ok: true });
    }
    return response(200, {});
  });
  context.processOutboundTicketEmails();
  context.processOutboundTicketEmails();
  assert.equal(sends.length, 1);
  assert.equal(sends[0][0], "test@example.com");
  assert.equal(acknowledgementCalls, 2);
});

test("focused outbound test requests only its ticket and skips other events", () => {
  const events = [
    { event_id: "old", ticket_id: "TKT-OLD", recipient_email: "other@example.com",
      subject: "Old", body_text: "Old", gmail_thread_id: null },
    { event_id: "selected", ticket_id: "TKT-00223", recipient_email: "test@example.com",
      subject: "Test", body_text: "Test", gmail_thread_id: null }
  ];
  const marked = [];
  const { context, sends, values } = harness((url, options) => {
    if (url.includes("/pending?")) {
      assert.equal(new URL(url).searchParams.get("ticketId"), "TKT-00223");
      assert.ok(new URL(url).searchParams.has("_ts"));
      return response(200, { events });
    }
    if (url.endsWith("/mark-sent")) marked.push(JSON.parse(options.payload).eventId);
    return response(200, { ok: true });
  });
  values.set("TEST_TICKET_ID", "TKT-00223");
  context.processOutboundTicketEmails();
  assert.equal(sends.length, 1);
  assert.equal(sends[0][0], "test@example.com");
  assert.deepEqual(marked, ["selected"]);
});
