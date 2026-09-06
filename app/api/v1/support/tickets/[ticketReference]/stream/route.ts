import {
  corsHeaders,
  isValidSessionId,
  normalizeMerchantId,
  normalizeText,
  publicTicketStatus,
  supportJson,
  supportOptions
} from "@/lib/support/api";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseTicketAttachments } from "@/lib/support/ticket-attachments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type StreamRouteProps = {
  params: { ticketReference: string };
};

export async function OPTIONS(request: Request) {
  return supportOptions(request);
}

export async function GET(request: Request, { params }: StreamRouteProps) {
  const { searchParams } = new URL(request.url);
  const merchantId = normalizeMerchantId(searchParams.get("merchant_id"));
  const sessionId = normalizeText(searchParams.get("session_id"));

  if (!merchantId || !sessionId || !isValidSessionId(sessionId)) {
    return supportJson(request, { error: "A valid merchant and widget session are required" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: ticket } = await supabase
    .from("tickets")
    .select("ticket_id, widget_session_id")
    .eq("ticket_id", params.ticketReference)
    .eq("business_id", merchantId)
    .eq("source", "Widget")
    .maybeSingle<{ ticket_id: string; widget_session_id: string | null }>();

  if (!ticket) {
    return supportJson(request, { error: "Ticket not found" }, { status: 404 });
  }
  if (ticket.widget_session_id !== sessionId) {
    return supportJson(request, { error: "This browser session cannot access that conversation" }, { status: 403 });
  }

  const realtimeToken = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!realtimeToken) {
    return supportJson(request, { error: "Realtime is not configured" }, { status: 503 });
  }
  await supabase.realtime.setAuth(realtimeToken);

  const encoder = new TextEncoder();
  let keepAlive: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;

  function enqueue(value: string) {
    if (!closed && controllerRef) {
      try {
        controllerRef.enqueue(encoder.encode(value));
      } catch {
        cleanup();
      }
    }
  }

  const channel = supabase
    .channel(`ticket-conversation:${ticket.ticket_id}`, {
      config: { private: true }
    })
    .on(
      "broadcast",
      { event: "INSERT" },
      (payload) => {
        const change = payload.payload as {
          table?: string;
          record?: Record<string, unknown>;
          new?: Record<string, unknown>;
        };
        if (change.table && change.table !== "ticket_notes") return;
        const message = (change.record ?? change.new ?? change) as {
          note_id: string;
          note_body: string;
          sender_type: string;
          sender_name: string | null;
          attachments?: unknown;
          created_at: string;
        };
        enqueue(`data: ${JSON.stringify({
          id: message.note_id,
          author: message.sender_type === "customer" ? message.sender_name ?? "You" : message.sender_name ?? "Support",
          sender_type: message.sender_type,
          body: message.note_body,
          attachments: parseTicketAttachments(message.attachments).map(
            ({ path: _path, ...attachment }) => ({
              ...attachment,
              url: `/api/v1/support/tickets/${encodeURIComponent(ticket.ticket_id)}/attachments/${encodeURIComponent(attachment.id)}?merchant_id=${encodeURIComponent(merchantId)}&session_id=${encodeURIComponent(sessionId)}`
            })
          ),
          created_at: message.created_at
        })}\n\n`);
      }
    )
    .on(
      "broadcast",
      { event: "UPDATE" },
      (payload) => {
        const change = payload.payload as {
          table?: string;
          record?: Record<string, unknown>;
          new?: Record<string, unknown>;
        };
        if (change.table && change.table !== "tickets") return;
        const updatedTicket = (change.record ?? change.new ?? change) as {
          status: string;
          resolution_notes: string | null;
          updated_at: string;
        };
        enqueue(`event: ticket-status\ndata: ${JSON.stringify({
          status: publicTicketStatus(updatedTicket.status),
          message: updatedTicket.resolution_notes
            ? {
                id: `${ticket.ticket_id}:resolution`,
                author: "Support",
                sender_type: "system",
                body: updatedTicket.resolution_notes,
                created_at: updatedTicket.updated_at
              }
            : null
        })}\n\n`);
      }
    );

  function cleanup() {
    if (closed) return;
    closed = true;
    if (keepAlive) clearInterval(keepAlive);
    void supabase.removeChannel(channel);
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
      enqueue("retry: 3000\n\n");
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") enqueue("event: ready\ndata: {}\n\n");
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
      ...corsHeaders(request),
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no"
    }
  });
}
