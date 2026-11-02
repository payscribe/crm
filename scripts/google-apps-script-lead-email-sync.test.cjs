const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "google-apps-script-lead-email-sync.js"), "utf8");

function gmailMessage({ id, from, to, cc = "", date, draft = false }) {
  return {
    getId: () => id, isDraft: () => draft, getHeader: () => "<" + id + "@mail>",
    getFrom: () => from, getTo: () => to, getCc: () => cc,
    getSubject: () => "Pricing", getPlainBody: () => "Hello", getDate: () => new Date(date)
  };
}

function harness({ leads, threads, fetch }) {
  const values = new Map([
    ["CRM_BASE_URL", "https://crm.example"], ["CRM_SECRET", "test-secret"],
    ["MAILBOX_EMAIL", "sales@payscribe.co"]
  ]);
  const searches = [];
  const posts = [];
  const context = {
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (key) => values.get(key) ?? null,
      setProperty: (key, value) => values.set(key, value)
    }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    GmailApp: { search: (query, offset) => {
      searches.push(query);
      return offset ? [] : threads(query);
    } },
    UrlFetchApp: { fetch: (url, options) => {
      if (url.includes("/leads?_ts=")) return response(200, { leads });
      const payload = JSON.parse(options.payload);
      posts.push(payload);
      return fetch ? fetch(payload) : response(200, { logged: payload.messages.length, duplicates: 0, notified: 0 });
    } },
    Logger: { log: () => {} },
    Utilities: { sleep: () => {} },
    Date, JSON, String, Number, Math
  };
  vm.runInNewContext(source, context);
  return { context, posts, searches, values };
}

function response(status, body) {
  return { getResponseCode: () => status, getContentText: () => JSON.stringify(body) };
}

function thread(id, messages) {
  return { getId: () => id, getMessages: () => messages };
}

test("sends only recent messages that involve a lead, flagged for Slack", () => {
  const now = Date.now();
  const { context, posts, values } = harness({
    leads: [{ leadId: "PS-1", email: "lead@acme.com", historySynced: true }],
    threads: () => [thread("t-1", [
      gmailMessage({ id: "m-1", from: "Lead <lead@acme.com>", to: "sales@payscribe.co", date: now - 60000 }),
      gmailMessage({ id: "m-2", from: "sales@payscribe.co", to: "other@example.com", date: now - 60000 }),
      gmailMessage({ id: "m-3", from: "sales@payscribe.co", to: "lead@acme.com", date: now - 60000, draft: true })
    ])]
  });
  values.set("LEAD_SYNC_CURSOR", String(now - 5 * 60000));
  context.syncLeadEmails();
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].messages.map((m) => m.gmailMessageId), ["m-1"]);
  assert.equal(posts[0].messages[0].notify, true);
  assert.equal(posts[0].messages[0].messageId, "<m-1@mail>");
});

test("does not advance the cursor when the CRM rejects the batch", () => {
  const now = Date.now();
  const { context, values } = harness({
    leads: [{ leadId: "PS-1", email: "lead@acme.com", historySynced: true }],
    threads: () => [thread("t-1", [
      gmailMessage({ id: "m-1", from: "lead@acme.com", to: "sales@payscribe.co", date: now - 60000 })
    ])],
    fetch: () => response(400, { error: "bad" })
  });
  values.set("LEAD_SYNC_CURSOR", String(now - 5 * 60000));
  assert.throws(() => context.syncLeadEmails());
  assert.equal(values.get("LEAD_SYNC_CURSOR"), String(now - 5 * 60000));
});

test("imports history for a new lead without Slack and marks it complete", () => {
  const { context, posts, searches } = harness({
    leads: [{ leadId: "PS-2", email: "new@acme.com", historySynced: false }],
    threads: (query) => query.includes("newer_than:") ? [thread("t-2", [
      gmailMessage({ id: "old-1", from: "sales@payscribe.co", to: "New <new@acme.com>", date: "2026-08-01T10:00:00Z" })
    ])] : []
  });
  context.syncLeadEmails();
  const historyQuery = searches.find((query) => query.includes("newer_than:90d"));
  assert.ok(historyQuery.includes("{from:new@acme.com to:new@acme.com cc:new@acme.com}"));
  const historyPost = posts.find((post) => post.completedBackfills.length > 0);
  assert.deepEqual(historyPost.completedBackfills, [{ leadId: "PS-2", email: "new@acme.com" }]);
  assert.equal(historyPost.messages[0].notify, false);
});

test("first run starts from now instead of replaying the mailbox", () => {
  const { context, searches, values } = harness({
    leads: [{ leadId: "PS-1", email: "lead@acme.com", historySynced: true }],
    threads: () => []
  });
  const before = Date.now();
  context.syncLeadEmails();
  const after = Number(searches[0].match(/after:(\d+)/)[1]) * 1000;
  assert.ok(after >= before - 11 * 60000);
  assert.ok(Number(values.get("LEAD_SYNC_CURSOR")) >= before);
});
