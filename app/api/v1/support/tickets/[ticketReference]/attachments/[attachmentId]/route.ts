import {
  isValidSessionId,
  normalizeMerchantId,
  normalizeText,
  supportJson,
  supportOptions
} from "@/lib/support/api";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  parseTicketAttachments,
  ticketAttachmentContentDisposition,
  ticketAttachmentBucket
} from "@/lib/support/ticket-attachments";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return supportOptions(request);
}

export async function GET(
  request: Request,
  { params }: { params: { ticketReference: string; attachmentId: string } }
) {
  const url = new URL(request.url);
  const merchantId = normalizeMerchantId(url.searchParams.get("merchant_id"));
  const sessionId = normalizeText(url.searchParams.get("session_id"));
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
  if (!ticket || ticket.widget_session_id !== sessionId) {
    return supportJson(request, { error: "Attachment not found" }, { status: 404 });
  }

  const { data: notes } = await supabase
    .from("ticket_notes")
    .select("attachments")
    .eq("ticket_id", ticket.ticket_id)
    .returns<Array<{ attachments: unknown }>>();
  const attachment = (notes ?? [])
    .flatMap((note) => parseTicketAttachments(note.attachments))
    .find((item) => item.id === params.attachmentId);
  if (!attachment) return supportJson(request, { error: "Attachment not found" }, { status: 404 });

  const { data, error } = await supabase.storage
    .from(ticketAttachmentBucket)
    .download(attachment.path);
  if (error || !data) return supportJson(request, { error: "Attachment unavailable" }, { status: 404 });
  const inline = url.searchParams.get("disposition") === "inline";
  return new Response(await data.arrayBuffer(), {
    headers: {
      "Content-Type": attachment.mime_type,
      "Content-Length": String(attachment.size),
      "Content-Disposition": ticketAttachmentContentDisposition(
        attachment.name,
        inline ? "inline" : "attachment"
      ),
      "Cache-Control": "private, max-age=300"
    }
  });
}
