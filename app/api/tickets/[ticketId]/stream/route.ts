import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: { ticketId: string } }
) {
  const authenticatedSupabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await authenticatedSupabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // This query intentionally uses the signed-in client so Tickets RLS remains
  // the authority for who may subscribe to a conversation.
  const { data: visibleTicket } = await authenticatedSupabase
    .from("tickets")
    .select("ticket_id")
    .eq("ticket_id", params.ticketId)
    .maybeSingle<{ ticket_id: string }>();
  if (!visibleTicket) {
    return Response.json({ error: "Ticket not found" }, { status: 404 });
  }
  const ticketId = visibleTicket.ticket_id;

  const supabase = createSupabaseAdminClient();
  const realtimeToken = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!realtimeToken) {
    return Response.json({ error: "Realtime is not configured" }, { status: 503 });
  }
  await supabase.realtime.setAuth(realtimeToken);

  const encoder = new TextEncoder();
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
  let keepAlive: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  function cleanup() {
    if (closed) return;
    closed = true;
    if (keepAlive) clearInterval(keepAlive);
    void supabase.removeChannel(channel);
  }

  function enqueue(value: string) {
    if (!closed && controllerRef) {
      try {
        controllerRef.enqueue(encoder.encode(value));
      } catch {
        cleanup();
      }
    }
  }

  async function sendSnapshot() {
    const { data } = await supabase
      .from("ticket_notes")
      .select("note_id, ticket_id, note_body, created_by, sender_type, sender_name, client_message_id, attachments, created_at")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });
    enqueue(`event: snapshot\ndata: ${JSON.stringify(data ?? [])}\n\n`);
  }

  const channel = supabase
    .channel(`ticket-conversation:${ticketId}`, {
      config: { private: true }
    })
    .on("broadcast", { event: "INSERT" }, (payload) => {
      const change = payload.payload as {
        table?: string;
        record?: Record<string, unknown>;
        new?: Record<string, unknown>;
      };
      if (change.table && change.table !== "ticket_notes") return;
      const message = change.record ?? change.new ?? change;
      enqueue(`data: ${JSON.stringify(message)}\n\n`);
    });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
      enqueue("retry: 3000\n\n");
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          enqueue("event: ready\ndata: {}\n\n");
          void sendSnapshot();
        }
        if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status) && !closed) {
          enqueue("event: upstream-error\ndata: {}\n\n");
          try {
            controller.close();
          } finally {
            cleanup();
          }
        }
      });
      keepAlive = setInterval(() => enqueue(": keep-alive\n\n"), 20_000);
      request.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      cleanup();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Content-Encoding": "none",
      "X-Accel-Buffering": "no"
    }
  });
}
