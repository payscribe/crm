import { AppShell } from "@/components/app-shell";
import { EmptyTableRow } from "@/components/ui/empty-table-row";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { getBusinessAttentionLists } from "@/lib/businesses/attention";
import { defaultAutomationSettings } from "@/lib/constants/automation-settings";
import { businessLifecycleStages } from "@/lib/constants/businesses";
import { leadStages } from "@/lib/constants/leads";
import { formatDate } from "@/lib/format/date";
import { hasModulePermission } from "@/lib/permissions/checks";
import type { AutomationSettings } from "@/lib/types/automation-settings";
import type { Business } from "@/lib/types/businesses";
import type { Lead } from "@/lib/types/leads";
import type { Partner } from "@/lib/types/partners";
import type { ProductEvent } from "@/lib/types/product-events";
import type { Ticket } from "@/lib/types/tickets";
import type { StaffUser } from "@/lib/types/users";
import Link from "next/link";

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

function isTodayOrPast(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(value).getTime() <= today.getTime();
}

export default async function HomePage() {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();

  const canViewBusinesses = hasModulePermission(
    currentUser,
    permissions,
    "Businesses",
    "can_view"
  );
  const canViewLeads = hasModulePermission(
    currentUser,
    permissions,
    "Leads",
    "can_view"
  );
  const canViewTickets = hasModulePermission(
    currentUser,
    permissions,
    "Tickets",
    "can_view"
  );
  const canViewPartners = hasModulePermission(
    currentUser,
    permissions,
    "Partners",
    "can_view"
  );
  const canViewProductLog = hasModulePermission(
    currentUser,
    permissions,
    "Product Log",
    "can_view"
  );

  const [
    { data: staffMembers },
    { data: businesses },
    { data: automationSettings },
    { data: leads },
    { data: tickets },
    { data: partners },
    { data: productEvents }
  ] = await Promise.all([
    supabase.from("users").select("*").returns<StaffUser[]>(),
    canViewBusinesses
      ? supabase.from("businesses").select("*").returns<Business[]>()
      : Promise.resolve({ data: [] as Business[] }),
    canViewBusinesses
      ? supabase
          .from("automation_settings")
          .select("*")
          .eq("settings_id", true)
          .maybeSingle<AutomationSettings>()
      : Promise.resolve({ data: null as AutomationSettings | null }),
    canViewLeads
      ? supabase.from("leads").select("*").returns<Lead[]>()
      : Promise.resolve({ data: [] as Lead[] }),
    canViewTickets
      ? supabase.from("tickets").select("*").returns<Ticket[]>()
      : Promise.resolve({ data: [] as Ticket[] }),
    canViewPartners
      ? supabase.from("partners").select("*").returns<Partner[]>()
      : Promise.resolve({ data: [] as Partner[] }),
    canViewProductLog
      ? supabase.from("product_events").select("*").returns<ProductEvent[]>()
      : Promise.resolve({ data: [] as ProductEvent[] })
  ]);

  const staffById = new Map(
    (staffMembers ?? []).map((staffMember) => [
      staffMember.user_id,
      staffMember.full_name
    ])
  );
  const businessRecords = businesses ?? [];
  const leadRecords = leads ?? [];
  const ticketRecords = tickets ?? [];
  const partnerRecords = partners ?? [];
  const productEventRecords = productEvents ?? [];

  const businessAttention = getBusinessAttentionLists(
    businessRecords,
    automationSettings ?? defaultAutomationSettings
  );
  const openTickets = ticketRecords.filter(isOpenTicket);
  const breachedTickets = ticketRecords.filter(isSlaBreached);
  const ticketsDueToday = ticketRecords.filter(
    (ticket) => isOpenTicket(ticket) && isTodayOrPast(ticket.sla_deadline)
  );
  const leadFollowupsDue = leadRecords.filter(
    (lead) =>
      !["Closed Won", "Closed Lost"].includes(lead.status) &&
      isTodayOrPast(lead.next_followup_date)
  );
  const hotLeadFollowups = leadFollowupsDue.filter(
    (lead) => lead.status === "Hot"
  );
  const partnerReviewsDue = partnerRecords.filter(
    (partner) => partner.would_revisit && isTodayOrPast(partner.next_review_date)
  );
  const activeOutages = productEventRecords.filter(
    (event) =>
      event.event_type === "Unplanned Outage" && event.status !== "Resolved"
  );

  return (
    <AppShell currentUser={currentUser} permissions={permissions}>
      <section>
        <PageHeader
          eyebrow="Dashboard"
          title="Today's work overview"
          description="Live operational summary from the modules you can access."
          actions={
            <Link
              href="/reports"
              className="rounded border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 transition hover:border-payscribe-blue hover:text-payscribe-blue"
            >
              Open Reports
            </Link>
          }
        />

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <MetricCard
            label="Access mode"
            value={currentUser.is_super_admin ? "Super Admin" : "Staff"}
            density="compact"
          />
          <MetricCard
            label="Visible modules"
            value={
              currentUser.is_super_admin
                ? "All"
                : permissions.filter((permission) => permission.can_view).length
            }
            density="compact"
          />
          <MetricCard label="Status" value={currentUser.status} density="compact" />
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {canViewTickets ? (
            <>
              <MetricCard label="Open Tickets" value={openTickets.length} density="compact" />
              <MetricCard label="SLA Breached" value={breachedTickets.length} density="compact" />
            </>
          ) : null}
          {canViewLeads ? (
            <MetricCard label="Lead Follow-ups Due" value={leadFollowupsDue.length} density="compact" />
          ) : null}
          {canViewBusinesses ? (
            <MetricCard
              label="At Risk Businesses"
              value={businessAttention.atRiskBusinesses.length}
              density="compact"
            />
          ) : null}
          {canViewProductLog ? (
            <MetricCard label="Active Outages" value={activeOutages.length} density="compact" />
          ) : null}
        </div>

        {canViewTickets ? (
          <section className="mt-8 rounded border border-neutral-200 bg-white">
            <div className="flex flex-col gap-3 border-b border-neutral-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-neutral-950">
                  Ticket Workload
                </h3>
                <p className="mt-1 text-sm text-neutral-600">
                  SLA-sensitive complaint work needing attention.
                </p>
              </div>
              <Link
                href="/tickets/attention"
                className="rounded bg-payscribe-blue px-4 py-2 text-sm font-semibold text-white"
              >
                Open Ticket Attention
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200 text-sm">
                <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-4 py-3">Ticket</th>
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3">Assigned</th>
                    <th className="px-4 py-3">SLA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {[...breachedTickets, ...ticketsDueToday]
                    .filter(
                      (ticket, index, list) =>
                        list.findIndex((item) => item.ticket_id === ticket.ticket_id) ===
                        index
                    )
                    .slice(0, 6)
                    .map((ticket) => (
                      <tr key={ticket.ticket_id}>
                        <td className="px-4 py-4">
                          <Link
                            href={`/tickets/${ticket.ticket_id}`}
                            className="font-semibold text-payscribe-blue hover:underline"
                          >
                            {ticket.ticket_id}
                          </Link>
                          <div className="mt-1 text-xs text-neutral-500">
                            {ticket.subject}
                            <span className="block">
                              {ticket.issue_category}
                              {ticket.sub_category ? ` / ${ticket.sub_category}` : ""}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-neutral-700">
                          {ticket.priority}
                        </td>
                        <td className="px-4 py-4 text-neutral-700">
                          {ticket.assigned_to
                            ? staffById.get(ticket.assigned_to) ?? "Unknown"
                            : "Unassigned"}
                        </td>
                        <td className="px-4 py-4 text-neutral-700">
                          {formatDate(ticket.sla_deadline)}
                        </td>
                      </tr>
                    ))}
                  {breachedTickets.length + ticketsDueToday.length === 0 ? (
                    <EmptyTableRow
                      colSpan={4}
                      message="Nothing needs attention here."
                    />
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {canViewLeads ? (
          <section className="mt-6 rounded border border-neutral-200 bg-white">
            <div className="flex flex-col gap-3 border-b border-neutral-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-neutral-950">
                  Growth Follow-ups
                </h3>
                <p className="mt-1 text-sm text-neutral-600">
                  Lead activity that should be touched today.
                </p>
              </div>
              <Link
                href="/leads/attention"
                className="rounded bg-payscribe-blue px-4 py-2 text-sm font-semibold text-white"
              >
                Open Lead Attention
              </Link>
            </div>
            <div className="grid gap-3 border-b border-neutral-200 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="Pipeline Leads" value={leadRecords.length} density="compact" />
              <MetricCard label="Hot Due Today" value={hotLeadFollowups.length} density="compact" />
              <MetricCard label="Overdue/Due Follow-ups" value={leadFollowupsDue.length} density="compact" />
              <MetricCard
                label="Qualified/Demo"
                value={
                  leadRecords.filter((lead) =>
                    ["Qualified", "Demo Scheduled"].includes(lead.stage)
                  ).length
                }
                density="compact"
              />
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
              {leadStages.map((stage) => (
                <MetricCard
                  key={stage}
                  label={stage}
                  value={leadRecords.filter((lead) => lead.stage === stage).length}
                  density="compact"
                />
              ))}
            </div>
          </section>
        ) : null}

        {canViewBusinesses ? (
          <section className="mt-6 rounded border border-neutral-200 bg-white">
            <div className="flex flex-col gap-3 border-b border-neutral-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-neutral-950">
                  Business Lifecycle
                </h3>
                <p className="mt-1 text-sm text-neutral-600">
                  Lifecycle counts and businesses that need operational follow-up.
                </p>
              </div>
              <Link
                href="/businesses/attention"
                className="rounded bg-payscribe-blue px-4 py-2 text-sm font-semibold text-white"
              >
                Open Business Attention
              </Link>
            </div>
            <div className="grid gap-3 border-b border-neutral-200 p-4 sm:grid-cols-2 lg:grid-cols-4">
              {businessLifecycleStages.map((stage) => (
                <MetricCard
                  key={stage}
                  label={stage}
                  value={
                    businessRecords.filter(
                      (business) => business.lifecycle_stage === stage
                    ).length
                  }
                  density="compact"
                />
              ))}
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="At Risk"
                value={businessAttention.atRiskBusinesses.length}
                density="compact"
              />
              <MetricCard
                label="Inactive 30+ Days"
                value={businessAttention.inactive30Days.length}
                density="compact"
              />
              <MetricCard
                label="KYB Not Submitted"
                value={businessAttention.kybNotSubmitted48Hours.length}
                density="compact"
              />
              <MetricCard
                label="Near Transaction Limit"
                value={businessAttention.approachingTransactionLimit.length}
                density="compact"
              />
            </div>
          </section>
        ) : null}

        {(canViewPartners || canViewProductLog) ? (
          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            {canViewPartners ? (
              <section className="rounded border border-neutral-200 bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-neutral-950">
                      Partner View
                    </h3>
                    <p className="mt-1 text-sm text-neutral-600">
                      Partner records due for review or active relationship tracking.
                    </p>
                  </div>
                  <Link
                    href="/partners"
                    className="rounded border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800"
                  >
                    Open Partners
                  </Link>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <MetricCard label="Total Partners" value={partnerRecords.length} density="compact" />
                  <MetricCard
                    label="Active Partners"
                    value={
                      partnerRecords.filter(
                        (partner) => partner.outreach_status === "Active Partner"
                      ).length
                    }
                    density="compact"
                  />
                  <MetricCard label="Reviews Due" value={partnerReviewsDue.length} density="compact" />
                  <MetricCard
                    label="Critical Uncontacted"
                    value={
                      partnerRecords.filter(
                        (partner) =>
                          partner.priority === "Critical" &&
                          partner.outreach_status === "Identified"
                      ).length
                    }
                    density="compact"
                  />
                </div>
              </section>
            ) : null}

            {canViewProductLog ? (
              <section className="rounded border border-neutral-200 bg-white p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-neutral-950">
                      Product Events
                    </h3>
                    <p className="mt-1 text-sm text-neutral-600">
                      Platform events that may affect complaints or onboarding.
                    </p>
                  </div>
                  <Link
                    href="/product-log"
                    className="rounded border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800"
                  >
                    Open Product Log
                  </Link>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <MetricCard label="Active Outages" value={activeOutages.length} density="compact" />
                  <MetricCard
                    label="Monitoring"
                    value={
                      productEventRecords.filter(
                        (event) => event.status === "Monitoring"
                      ).length
                    }
                    density="compact"
                  />
                  <MetricCard
                    label="High/Critical"
                    value={
                      productEventRecords.filter((event) =>
                        ["High", "Critical"].includes(event.severity ?? "")
                      ).length
                    }
                    density="compact"
                  />
                  <MetricCard
                    label="Total Events"
                    value={productEventRecords.length}
                    density="compact"
                  />
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
