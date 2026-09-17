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

function run(messageId, inReplyTo) {
  const tickets = [
    { ticket_id: "OPEN-1", status: "Open", customer_email: "customer@example.com",
      inbound_email_thread_id: "current-thread" },
    { ticket_id: "CLOSED-1", status: "Closed", customer_email: "customer@example.com",
      inbound_email_thread_id: "old-thread" },
    { ticket_id: "OTHER-1", status: "Open", customer_email: "other@example.com",
      inbound_email_thread_id: "other-thread" }
  ];
  const savedEvents = [];
  let createdTickets = 0;
  const supabase = {
    from(table) {
      if (table === "inbound_email_events") {
        return { insert: async (event) => { savedEvents.push(event); return { error: null }; } };
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
        insert() { createdTickets++; throw new Error("Created a second ticket"); }
      };
    }
  };
  const exports = {};
  const context = {
    exports, module: { exports },
    require(specifier) {
      if (specifier === "next/server") return { NextResponse: { json: (body) => body } };
      if (specifier === "@/lib/supabase/admin") return { createSupabaseAdminClient: () => supabase };
      return {};
    },
    Date, String, RegExp
  };
  vm.runInNewContext(compiled, context);
  const payload = {
    MessageID: messageId,
    Subject: "A new issue",
    TextBody: "Please help with this issue",
    HtmlBody: "",
    Date: "2026-09-17T10:00:00Z",
    From: "customer@example.com",
    FromFull: { Email: "customer@example.com", Name: "Customer" },
    Headers: inReplyTo ? [{ Name: "In-Reply-To", Value: inReplyTo }] : []
  };
  return context.exports.processInboundTicket(payload, "postmark")
    .then((response) => ({ response, savedEvents, createdTickets }));
}

for (const [description, inReplyTo] of [
  ["new thread", null],
  ["reply to an old closed thread", "old-thread"],
  ["reply to somebody else's open thread", "other-thread"]
]) {
  test(`${description} uses the sender's existing open ticket`, async () => {
    const result = await run(description, inReplyTo);
    assert.equal(result.response.ticketId, "OPEN-1");
    assert.equal(result.response.reply, true);
    assert.equal(result.createdTickets, 0);
    assert.equal(result.savedEvents[0].ticket_id, "OPEN-1");
  });
}
