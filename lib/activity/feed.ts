import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ActivityEntry,
  ActivityLogRow,
  CrmRecordType
} from "@/lib/types/activity";
import type { LeadCommunicationLog } from "@/lib/types/leads";
import type { PartnerCommunicationLog } from "@/lib/types/partners";
import type { TicketNote } from "@/lib/types/tickets";

function fromActivityLog(row: ActivityLogRow): ActivityEntry {
  return {
    id: row.activity_id,
    source: "activity_log",
    entityType: row.entity_type,
    entityId: row.entity_id,
    date: row.created_at,
    channel: row.channel,
    direction: row.direction,
    actorId: row.created_by,
    summary: row.summary
  };
}

function fromLeadLog(row: LeadCommunicationLog): ActivityEntry {
  return {
    id: row.log_id,
    source: "communication_log",
    entityType: "Lead",
    entityId: row.lead_id,
    date: row.date,
    channel: row.channel,
    direction: row.direction,
    actorId: row.logged_by,
    summary: row.summary
  };
}

function fromPartnerLog(row: PartnerCommunicationLog): ActivityEntry {
  return {
    id: row.log_id,
    source: "communication_log",
    entityType: "Partner",
    entityId: row.partner_id,
    date: row.date,
    channel: row.channel,
    direction: row.direction,
    actorId: row.logged_by,
    summary: row.summary
  };
}

function fromTicketNote(row: TicketNote): ActivityEntry {
  return {
    id: row.note_id,
    source: "ticket_note",
    entityType: "Ticket",
    entityId: row.ticket_id,
    date: row.created_at,
    channel: null,
    direction: row.sender_type === "customer" ? "Inbound" : "Outbound",
    actorId: row.created_by,
    summary: row.note_body
  };
}

function sortByDateDesc(entries: ActivityEntry[]) {
  return entries.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export async function fetchActivityFeed(
  supabase: SupabaseClient,
  entityType: CrmRecordType,
  entityId: string
): Promise<ActivityEntry[]> {
  const activityLogPromise = supabase
    .from("activity_log")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .returns<ActivityLogRow[]>();

  if (entityType === "Lead") {
    const [{ data: activity }, { data: logs }] = await Promise.all([
      activityLogPromise,
      supabase
        .from("lead_communication_log")
        .select("*")
        .eq("lead_id", entityId)
        .returns<LeadCommunicationLog[]>()
    ]);

    return sortByDateDesc([
      ...(activity ?? []).map(fromActivityLog),
      ...(logs ?? []).map(fromLeadLog)
    ]);
  }

  if (entityType === "Partner") {
    const [{ data: activity }, { data: logs }] = await Promise.all([
      activityLogPromise,
      supabase
        .from("partner_communication_log")
        .select("*")
        .eq("partner_id", entityId)
        .returns<PartnerCommunicationLog[]>()
    ]);

    return sortByDateDesc([
      ...(activity ?? []).map(fromActivityLog),
      ...(logs ?? []).map(fromPartnerLog)
    ]);
  }

  if (entityType === "Ticket") {
    const [{ data: activity }, { data: notes }] = await Promise.all([
      activityLogPromise,
      supabase
        .from("ticket_notes")
        .select("*")
        .eq("ticket_id", entityId)
        .returns<TicketNote[]>()
    ]);

    return sortByDateDesc([
      ...(activity ?? []).map(fromActivityLog),
      ...(notes ?? []).map(fromTicketNote)
    ]);
  }

  // Business: merge activity_log entries with notes from every ticket linked to this business.
  const [{ data: activity }, { data: ticketRows }] = await Promise.all([
    activityLogPromise,
    supabase
      .from("tickets")
      .select("ticket_id")
      .eq("business_id", entityId)
      .returns<Array<{ ticket_id: string }>>()
  ]);

  const ticketIds = (ticketRows ?? []).map((row) => row.ticket_id);
  const { data: notes } = ticketIds.length
    ? await supabase
        .from("ticket_notes")
        .select("*")
        .in("ticket_id", ticketIds)
        .returns<TicketNote[]>()
    : { data: [] as TicketNote[] };

  return sortByDateDesc([
    ...(activity ?? []).map(fromActivityLog),
    ...(notes ?? []).map(fromTicketNote)
  ]);
}
