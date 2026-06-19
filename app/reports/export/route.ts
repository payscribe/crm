import { getCurrentUserContext } from "@/lib/auth/current-user";
import { getBusinessAttentionLists } from "@/lib/businesses/attention";
import { defaultAutomationSettings } from "@/lib/constants/automation-settings";
import { businessLifecycleStages } from "@/lib/constants/businesses";
import { leadSources, leadStages } from "@/lib/constants/leads";
import { partnerOutreachStatuses } from "@/lib/constants/partners";
import { severities } from "@/lib/constants/product-events";
import { ticketPriorities } from "@/lib/constants/tickets";
import { formatDate } from "@/lib/format/date";
import { hasModulePermission } from "@/lib/permissions/checks";
import {
  getLeadProductInterestOptions,
  getProductAreaOptions,
  mergeHistoricalLabels
} from "@/lib/settings/managed-options";
import type { AutomationSettings } from "@/lib/types/automation-settings";
import type { Business } from "@/lib/types/businesses";
import type { Lead } from "@/lib/types/leads";
import type { Partner } from "@/lib/types/partners";
import type { ProductEvent } from "@/lib/types/product-events";
import type { Ticket } from "@/lib/types/tickets";
import type { StaffUser } from "@/lib/types/users";
import { NextResponse } from "next/server";

function isThisMonth(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
}

function isOpenTicket(ticket: Ticket) {
  return ticket.status !== "Closed";
}

function isSlaBreached(ticket: Ticket) {
  return (
    Boolean(ticket.sla_deadline) &&
    new Date().getTime() > new Date(ticket.sla_deadline as string).getTime() &&
    isOpenTicket(ticket)
  );
}

function isDueThisWeek(value: string | null) {
  if (!value) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(today.getDate() + 7);
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime() >= today.getTime() && date.getTime() <= end.getTime();
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percent(part: number, total: number) {
  if (total === 0) {
    return "0%";
  }

  return `${Math.round((part / total) * 100)}%`;
}

function isValidDateInput(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isWithinDateRange(
  value: string | null | undefined,
  from: string,
  to: string
) {
  if (!value) {
    return false;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  if (from) {
    const start = new Date(`${from}T00:00:00`);

    if (date.getTime() < start.getTime()) {
      return false;
    }
  }

  if (to) {
    const end = new Date(`${to}T23:59:59.999`);

    if (date.getTime() > end.getTime()) {
      return false;
    }
  }

  return true;
}

function csvEscape(value: string | number | null | undefined) {
  const text = String(value ?? "");

  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

function csv(rows: Array<Array<string | number | null | undefined>>) {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
}

function exportResponse(tab: string, rows: Array<Array<string | number | null | undefined>>) {
  const body = csv(rows);
  const date = new Date().toISOString().slice(0, 10);

  return new Response(body, {
    headers: {
      "Content-Disposition": `attachment; filename="payscribe-${tab}-report-${date}.csv"`,
      "Content-Type": "text/csv; charset=utf-8"
    }
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tab = searchParams.get("tab") ?? "operations";
  const from = isValidDateInput(searchParams.get("from"))
    ? searchParams.get("from") ?? ""
    : "";
  const to = isValidDateInput(searchParams.get("to"))
    ? searchParams.get("to") ?? ""
    : "";
  const { supabase, currentUser, permissions } = await getCurrentUserContext();

  if (!hasModulePermission(currentUser, permissions, "Reports", "can_view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const canViewBusinesses = hasModulePermission(currentUser, permissions, "Businesses", "can_view");
  const canViewLeads = hasModulePermission(currentUser, permissions, "Leads", "can_view");
  const canViewTickets = hasModulePermission(currentUser, permissions, "Tickets", "can_view");
  const canViewPartners = hasModulePermission(currentUser, permissions, "Partners", "can_view");
  const canViewProductLog = hasModulePermission(currentUser, permissions, "Product Log", "can_view");

  const [
    { data: staffMembers },
    { data: businesses },
    { data: automationSettings },
    { data: leads },
    { data: tickets },
    { data: partners },
    { data: productEvents },
    leadProductInterestOptions,
    productAreaOptions
  ] = await Promise.all([
    supabase.from("users").select("*").returns<StaffUser[]>(),
    canViewBusinesses ? supabase.from("businesses").select("*").returns<Business[]>() : Promise.resolve({ data: [] as Business[] }),
    canViewBusinesses
      ? supabase.from("automation_settings").select("*").eq("settings_id", true).maybeSingle<AutomationSettings>()
      : Promise.resolve({ data: null as AutomationSettings | null }),
    canViewLeads ? supabase.from("leads").select("*").returns<Lead[]>() : Promise.resolve({ data: [] as Lead[] }),
    canViewTickets ? supabase.from("tickets").select("*").returns<Ticket[]>() : Promise.resolve({ data: [] as Ticket[] }),
    canViewPartners ? supabase.from("partners").select("*").returns<Partner[]>() : Promise.resolve({ data: [] as Partner[] }),
    canViewProductLog ? supabase.from("product_events").select("*").returns<ProductEvent[]>() : Promise.resolve({ data: [] as ProductEvent[] }),
    getLeadProductInterestOptions(supabase),
    getProductAreaOptions(supabase)
  ]);

  const staff = staffMembers ?? [];
  const staffById = new Map(staff.map((member) => [member.user_id, member.full_name]));
  const businessRecords = (businesses ?? []).filter((business) =>
    isWithinDateRange(business.created_at, from, to)
  );
  const leadRecords = (leads ?? []).filter((lead) =>
    isWithinDateRange(lead.created_at, from, to)
  );
  const ticketRecords = (tickets ?? []).filter((ticket) =>
    isWithinDateRange(ticket.date_raised, from, to)
  );
  const partnerRecords = (partners ?? []).filter((partner) =>
    isWithinDateRange(partner.created_at, from, to)
  );
  const productEventRecords = (productEvents ?? []).filter((event) =>
    isWithinDateRange(event.created_at, from, to)
  );
  const reportLeadProductOptions = mergeHistoricalLabels(
    leadProductInterestOptions,
    leadRecords.flatMap((lead) => lead.product_interest)
  );
  const reportProductAreaOptions = mergeHistoricalLabels(
    productAreaOptions,
    productEventRecords.flatMap((event) => event.affected_products)
  );
  const businessAttention = getBusinessAttentionLists(
    businessRecords,
    automationSettings ?? defaultAutomationSettings
  );
  const openTickets = ticketRecords.filter(isOpenTicket);
  const breachedTickets = ticketRecords.filter(isSlaBreached);
  const resolvedThisMonth = ticketRecords.filter(
    (ticket) => ticket.resolved_date && isThisMonth(ticket.resolved_date)
  );
  const resolutionAverage = average(
    resolvedThisMonth
      .map((ticket) => ticket.resolution_time_hours)
      .filter((value): value is number => typeof value === "number")
  );
  const convertedThisMonth = leadRecords.filter(
    (lead) => lead.status === "Closed Won" && isThisMonth(lead.updated_at)
  );
  const lostThisMonth = leadRecords.filter(
    (lead) => lead.status === "Closed Lost" && isThisMonth(lead.updated_at)
  );
  const partnerReviewsThisWeek = partnerRecords.filter(
    (partner) => partner.would_revisit && isDueThisWeek(partner.next_review_date)
  );

  if (tab === "growth" && canViewLeads) {
    return exportResponse("growth", [
      ["Section", "Metric", "Value", "Notes"],
      ["Summary", "Pipeline Leads", leadRecords.length, ""],
      ["Summary", "Hot Leads", leadRecords.filter((lead) => lead.status === "Hot").length, ""],
      ["Summary", "Converted This Month", convertedThisMonth.length, ""],
      ["Summary", "Conversion Rate", percent(convertedThisMonth.length, convertedThisMonth.length + lostThisMonth.length), ""],
      ...leadStages.map((stage) => ["Leads by Stage", stage, leadRecords.filter((lead) => lead.stage === stage).length, ""]),
      ...leadSources.map((source) => ["Leads by Source", source, leadRecords.filter((lead) => lead.source === source).length, ""]),
      ...reportLeadProductOptions.map((product) => ["Leads by Product Interest", product, leadRecords.filter((lead) => lead.product_interest.includes(product)).length, ""])
    ]);
  }

  if (tab === "cs" && canViewTickets) {
    return exportResponse("customer-support", [
      ["Section", "Metric", "Value", "Notes"],
      ["Summary", "Open Tickets", openTickets.length, ""],
      ["Summary", "SLA Breached", breachedTickets.length, ""],
      ["Summary", "SLA Breach Rate", percent(breachedTickets.length, openTickets.length), ""],
      ["Summary", "Average Resolution", `${resolutionAverage.toFixed(1)}h`, "Resolved this month"],
      ...staff.map((member) => {
        const assigned = ticketRecords.filter((ticket) => ticket.assigned_to === member.user_id);
        const openAssigned = assigned.filter(isOpenTicket);
        const averageResolution = average(
          assigned
            .map((ticket) => ticket.resolution_time_hours)
            .filter((value): value is number => typeof value === "number")
        );
        return [
          "CS Performance",
          member.full_name,
          assigned.length,
          `Open: ${openAssigned.length}; Avg resolution: ${averageResolution.toFixed(1)}h; SLA breach rate: ${percent(assigned.filter(isSlaBreached).length, openAssigned.length)}`
        ];
      }),
      ...breachedTickets.map((ticket) => [
        "Breached Tickets",
        ticket.ticket_id,
        ticket.subject,
        ticket.assigned_to ? staffById.get(ticket.assigned_to) ?? "Unknown" : "Unassigned"
      ])
    ]);
  }

  if (tab === "partners" && canViewPartners) {
    return exportResponse("partners", [
      ["Section", "Metric", "Value", "Notes"],
      ["Summary", "Total Partners", partnerRecords.length, ""],
      ["Summary", "Active Partners", partnerRecords.filter((partner) => partner.outreach_status === "Active Partner").length, ""],
      ["Summary", "Reviews This Week", partnerReviewsThisWeek.length, ""],
      ...partnerOutreachStatuses.map((status) => ["Partners by Outreach Status", status, partnerRecords.filter((partner) => partner.outreach_status === status).length, ""]),
      ...partnerReviewsThisWeek.map((partner) => [
        "Reviews Due This Week",
        partner.partner_id,
        partner.organisation_name,
        formatDate(partner.next_review_date)
      ])
    ]);
  }

  if (tab === "product" && canViewProductLog) {
    return exportResponse("product", [
      ["Section", "Metric", "Value", "Notes"],
      ...severities.map((severity) => ["Events by Severity", severity, productEventRecords.filter((event) => event.severity === severity).length, ""]),
      ...reportProductAreaOptions.map((area) => ["Events by Affected Product", area, productEventRecords.filter((event) => event.affected_products.includes(area)).length, ""]),
      ...productEventRecords.map((event) => [
        "Recent Product Events",
        event.event_id,
        event.title,
        `${event.event_type}; ${event.severity ?? "Not set"}; ${event.status}; ${formatDate(event.created_at)}`
      ])
    ]);
  }

  if ((tab === "operations" || tab === "") && (canViewBusinesses || canViewTickets)) {
    return exportResponse("operations", [
      ["Section", "Metric", "Value", "Notes"],
      ...businessLifecycleStages.map((stage) => ["Businesses by Lifecycle Stage", stage, businessRecords.filter((business) => business.lifecycle_stage === stage).length, ""]),
      ["Business Attention", "KYB Not Submitted", businessAttention.kybNotSubmitted48Hours.length, ""],
      ["Business Attention", "No First Transaction", businessAttention.noFirstTransaction7Days.length, ""],
      ["Business Attention", "Inactive 30+ Days", businessAttention.inactive30Days.length, ""],
      ["Business Attention", "Near Limit", businessAttention.approachingTransactionLimit.length, ""],
      ...ticketPriorities.map((priority) => ["Open Tickets by Priority", priority, openTickets.filter((ticket) => ticket.priority === priority).length, ""]),
      ["Ticket Health", "Open Tickets", openTickets.length, ""],
      ["Ticket Health", "SLA Breached", breachedTickets.length, ""],
      ["Ticket Health", "SLA Breach Rate", percent(breachedTickets.length, openTickets.length), ""],
      ["Ticket Health", "Average Resolution", `${resolutionAverage.toFixed(1)}h`, "Resolved this month"],
      ...businessAttention.atRiskBusinesses.map((business) => [
        "At Risk Businesses",
        business.business_id,
        business.business_name,
        business.assigned_cs_owner ? staffById.get(business.assigned_cs_owner) ?? "Unknown" : "Unassigned"
      ])
    ]);
  }

  return NextResponse.json({ error: "Report tab unavailable" }, { status: 404 });
}
