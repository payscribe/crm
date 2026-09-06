import { getCurrentUserContext } from "@/lib/auth/current-user";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  parseTicketAttachments,
  ticketAttachmentContentDisposition,
  ticketAttachmentBucket
} from "@/lib/support/ticket-attachments";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { ticketId: string; attachmentId: string } }
) {
  const { supabase } = await getCurrentUserContext();
  const { data: notes } = await supabase
    .from("ticket_notes")
    .select("attachments")
    .eq("ticket_id", params.ticketId)
    .returns<Array<{ attachments: unknown }>>();
  const attachment = (notes ?? [])
    .flatMap((note) => parseTicketAttachments(note.attachments))
    .find((item) => item.id === params.attachmentId);

  if (!attachment) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.storage
    .from(ticketAttachmentBucket)
    .download(attachment.path);
  if (error || !data) return NextResponse.json({ error: "Attachment unavailable" }, { status: 404 });

  const inline = new URL(request.url).searchParams.get("disposition") === "inline";
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
