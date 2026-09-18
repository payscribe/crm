const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../lib/email/inbound-ticket.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;

function run({ messageId, inReplyTo, senderEmail = "customer@example.com", businesses = [] }) {
  const tickets = [
    { ticket_id: "OPEN-1", status: "Open", customer_email: "customer@example.com",
      customer_notified_at: "2026-09-17T10:00:00Z", inbound_email_thread_id: "current-thread" },
    { ticket_id: "CLOSED-1", status: "Closed", customer_email: "customer@example.com",
      customer_notified_at: "2026-09-17T10:00:00Z", inbound_email_thread_id: "old-thread" },
    { ticket_id: "OTHER-1", status: "Open", customer_email: "other@example.com",
      customer_notified_at: "2026-09-17T10:00:00Z", inbound_email_thread_id: "other-thread" }
  ];
  const savedEvents = [];
  const savedTickets = [];
  let createdTickets = 0;
  const supabase = {
    from(table) {
      if (table === "inbound_email_events") {
        return {
          insert: async (event) => { savedEvents.push(event); return { error: null }; },
          update: () => ({ eq: async () => ({ error: null }) })
        };
      }
      if (table === "businesses") {
        let result = businesses;
        return {
          select() { return this; },
          ilike(key, value) {
            result = result.filter((business) =>
              String(business[key] ?? "").toLowerCase() === value.toLowerCase());
            return this;
          },
          eq(key, value) {
            result = result.filter((business) => business[key] === value);
            return this;
          },
          maybeSingle: async () => ({ data: result[0] ?? null })
        };
      }
      if (table === "outbound_email_events") {
        return { insert: async () => ({ error: null }) };
      }
      if (table === "automation_events") {
        return { insert: async () => ({ error: null }) };
      }
      if (table !== "tickets") throw new Error("Unexpected table: " + table);
      let result = tickets;
      return {
        select() { return this; },
        eq(key, value) { result = result.filter((ticket) => ticket[key] === value); return this; },
        ilike(key, value) { result = result.filter((ticket) =>
          String(ticket[key] ?? "").toLowerCase() === value.toLowerCase()); return this; },
        order() { return this; }, limit() { return this; },
        maybeSingle: async () => ({ data: result[0] ?? null }),
        insert(ticket) {
          createdTickets++;
          const created = { ...ticket, ticket_id: "NEW-1" };
          savedTickets.push(created);
          return { select: () => ({ single: async () => ({ data: { ticket_id: created.ticket_id }, error: null }) }) };
        }
      };
    }
  };
  const exports = {};
  const context = {
    exports, module: { exports },
    require(specifier) {
      if (specifier === "next/server") return { NextResponse: { json: (body) => body } };
      if (specifier === "@/lib/supabase/admin") return { createSupabaseAdminClient: () => supabase };
      if (specifier === "@/lib/email/outbound-events") return {
        queueTicketOpenedEmail: async () => true
      };
      if (specifier === "@/lib/notifications/slack") return {
        sendSlackChannelMessage: async () => ({ channelId: "C1", ts: "1.1" })
      };
      if (specifier === "@/lib/notifications/ticket-messages") return {
        ticketOpenedSlackMessage: () => "ticket opened"
      };
      return {};
    },
    process: { env: {} },
    Date, String, RegExp
  };
  vm.runInNewContext(compiled, context);
  const payload = {
    MessageID: messageId,
    Subject: "A new issue",
    TextBody: "Please help with this issue",
    HtmlBody: "",
    Date: "2026-09-17T10:00:00Z",
    From: senderEmail,
    FromFull: { Email: senderEmail, Name: "Customer" },
    Headers: inReplyTo ? [{ Name: "In-Reply-To", Value: inReplyTo }] : []
  };
  return context.exports.processInboundTicket(payload, "postmark")
    .then((response) => ({ response, savedEvents, savedTickets, createdTickets }));
}

for (const [description, inReplyTo] of [
  ["new thread", null],
  ["reply to an old closed thread", "old-thread"],
  ["reply to somebody else's open thread", "other-thread"]
]) {
  test(`${description} uses the sender's existing open ticket`, async () => {
    const result = await run({ messageId: description, inReplyTo });
    assert.equal(result.response.ticketId, "OPEN-1");
    assert.equal(result.response.reply, true);
    assert.equal(result.createdTickets, 0);
    assert.equal(result.savedEvents[0].ticket_id, "OPEN-1");
  });
}

test("unknown sender is logged but does not create a ticket", async () => {
  const result = await run({
    messageId: "unknown-sender",
    senderEmail: "unknown@example.com"
  });

  assert.equal(result.response.ignored, true);
  assert.equal(result.createdTickets, 0);
  assert.equal(result.savedEvents[0].processing_status, "Processed");
  assert.equal(result.savedEvents[0].ticket_id, undefined);
});

test("recognized business sender creates a ticket when no open ticket exists", async () => {
  const result = await run({
    messageId: "recognized-sender",
    senderEmail: "merchant@example.com",
    businesses: [{ business_id: "BIZ-1", business_name: "Merchant", email: "merchant@example.com" }]
  });

  assert.equal(result.response.ticketId, "NEW-1");
  assert.equal(result.response.matchedBusinessId, "BIZ-1");
  assert.equal(result.createdTickets, 1);
  assert.equal(result.savedTickets[0].business_id, "BIZ-1");
});
