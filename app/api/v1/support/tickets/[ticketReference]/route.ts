import {
  normalizeMerchantId,
  publicTicketStatus,
  supportJson,
  supportOptions
} from "@/lib/support/api";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type TicketLookupProps = {
  params: {
    ticketReference: string;
  };
};

export async function OPTIONS(request: Request) {
  return supportOptions(request);
}

export async function GET(request: Request, { params }: TicketLookupProps) {
  const { searchParams } = new URL(request.url);
  const merchantId = normalizeMerchantId(searchParams.get("merchant_id"));

  if (!merchantId) {
    return supportJson(request, { error: "merchant_id is required" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: ticket, error } = await supabase
    .from("tickets")
    .select("ticket_id, business_id, status, updated_at, resolution_notes")
    .eq("ticket_id", params.ticketReference)
    .eq("business_id", merchantId)
    .maybeSingle<{
      ticket_id: string;
      business_id: string | null;
      status: string;
      updated_at: string;
      resolution_notes: string | null;
    }>();

  if (error) {
    return supportJson(request, { error: error.message }, { status: 500 });
  }

  if (!ticket) {
    return supportJson(request, { error: "Ticket not found" }, { status: 404 });
  }

  const { data: notes } = await supabase
    .from("ticket_notes")
    .select("note_id, note_body, created_at")
    .eq("ticket_id", ticket.ticket_id)
    .order("created_at", { ascending: true })
    .limit(25)
    .returns<Array<{ note_id: string; note_body: string; created_at: string }>>();

  const responses = (notes ?? []).map((note) => ({
    id: note.note_id,
    author: "Support",
    body: note.note_body,
    created_at: note.created_at
  }));

  if (ticket.resolution_notes) {
    responses.push({
      id: `${ticket.ticket_id}:resolution`,
      author: "Support",
      body: ticket.resolution_notes,
      created_at: ticket.updated_at
    });
  }

  const latestResponse = responses[responses.length - 1] ?? null;

  return supportJson(request, {
    ticket_reference: ticket.ticket_id,
    status: publicTicketStatus(ticket.status),
    last_updated: latestResponse?.created_at ?? ticket.updated_at,
    last_agent_note: latestResponse?.body ?? null,
    responses
  });
}
