import { AppShell } from "@/components/app-shell";
import { EmptyTableRow } from "@/components/ui/empty-table-row";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
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
import Link from "next/link";
import { redirect } from "next/navigation";

type ReportsPageProps = {
  searchParams?: {
    from?: string;
    tab?: string;
    to?: string;
  };
};

type ReportTab = {
  href: string;
  id: string;
  label: string;
  visible: boolean;
};

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

function isValidDateInput(value: string | undefined) {
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

function dateParams(from: string, to: string) {
  const params = new URLSearchParams();

  if (from) {
    params.set("from", from);
  }

  if (to) {
    params.set("to", to);
  }

  return params;
}

function ReportBreakdownTable({
  title,
  rows
}: {
  title: string;
  rows: Array<[string, number]>;
}) {
  const max = Math.max(...rows.map(([, value]) => value), 1);

  return (
    <section className="rounded border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-4 py-3">
        <h3 className="text-base font-semibold text-neutral-950">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Share</th>
              <th className="px-4 py-3 text-right">Count</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {rows.map(([label, value]) => (
              <tr key={label}>
                <td className="px-4 py-3 font-medium text-neutral-800">
                  {label}
                </td>
                <td className="px-4 py-3">
                  <div className="h-2 rounded bg-neutral-100">
                    <div
                      className="h-2 rounded bg-payscribe-blue"
                      style={{ width: `${Math.max(4, (value / max) * 100)}%` }}
                    />
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-semibold text-neutral-950">
                  {value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ReportRecordTable({
  empty,
  rows,
  title
}: {
  empty: string;
  rows: Array<{
    href?: string;
    label: string;
    meta: string;
    value?: string;
  }>;
  title: string;
}) {
  return (
    <section className="overflow-hidden rounded border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-4 py-3">
        <h3 className="text-base font-semibold text-neutral-950">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3">Record</th>
              <th className="px-4 py-3">Details</th>
              <th className="px-4 py-3">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {rows.map((row) => (
              <tr key={`${row.label}-${row.meta}`}>
                <td className="px-4 py-4">
                  {row.href ? (
                    <Link href={row.href} className="font-semibold text-payscribe-blue hover:underline">
                      {row.label}
                    </Link>
                  ) : (
                    <span className="font-semibold text-neutral-950">{row.label}</span>
                  )}
                </td>
                <td className="px-4 py-4 text-neutral-700">{row.meta}</td>
                <td className="px-4 py-4 font-semibold text-neutral-700">
                  {row.value ?? "-"}
                </td>
              </tr>
            ))}

            {rows.length === 0 ? (
              <EmptyTableRow colSpan={3} message={empty} />
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TabNavigation({
  activeTab,
  tabs
}: {
  activeTab: string;
  tabs: ReportTab[];
}) {
  return (
    <div className="mt-6 overflow-x-auto border-b border-neutral-200">
      <nav className="flex min-w-max gap-2">
        {tabs.map((tab) => {
          const active = tab.id === activeTab;

          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${
                active
                  ? "border-payscribe-blue text-payscribe-blue"
                  : "border-transparent text-neutral-600 hover:border-neutral-300 hover:text-neutral-950"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();

  if (!hasModulePermission(currentUser, permissions, "Reports", "can_view")) {
    redirect("/");
  }

  const canViewBusinesses = hasModulePermission(currentUser, permissions, "Businesses", "can_view");
  const canViewLeads = hasModulePermission(currentUser, permissions, "Leads", "can_view");
  const canViewTickets = hasModulePermission(currentUser, permissions, "Tickets", "can_view");
  const canViewPartners = hasModulePermission(currentUser, permissions, "Partners", "can_view");
  const canViewProductLog = hasModulePermission(currentUser, permissions, "Product Log", "can_view");
  const from = isValidDateInput(searchParams?.from) ? searchParams?.from ?? "" : "";
  const to = isValidDateInput(searchParams?.to) ? searchParams?.to ?? "" : "";
  const activeDateParams = dateParams(from, to);

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
      : Promise.resolve({ data: [] as ProductEvent[] }),
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
  const activePartners = partnerRecords.filter(
    (partner) => partner.outreach_status === "Active Partner"
  );
  const partnerReviewsThisWeek = partnerRecords.filter(
    (partner) => partner.would_revisit && isDueThisWeek(partner.next_review_date)
  );
  const activeProductEvents = productEventRecords.filter(
    (event) => event.status !== "Resolved"
  );

  const tabs = [
    { id: "operations", label: "Operations", visible: canViewBusinesses || canViewTickets },
    { id: "growth", label: "Growth", visible: canViewLeads },
    { id: "cs", label: "Customer Support", visible: canViewTickets },
    { id: "partners", label: "Partners", visible: canViewPartners },
    { id: "product", label: "Product", visible: canViewProductLog }
  ].filter((tab) => tab.visible).map((tab) => {
    const params = new URLSearchParams(activeDateParams);
    params.set("tab", tab.id);

    return {
      ...tab,
      href: `/reports?${params.toString()}`
    };
  });
  const requestedTab = searchParams?.tab ?? tabs[0]?.id ?? "operations";
  const activeTab = tabs.some((tab) => tab.id === requestedTab)
    ? requestedTab
    : tabs[0]?.id ?? "operations";

  return (
    <AppShell currentUser={currentUser} permissions={permissions}>
      <section>
        <PageHeader
          eyebrow="Reports"
          title="Full Reporting Overview"
          description="Focused reporting views across CRM modules you can access."
          actions={
            <Link
              href="/"
              className="rounded border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 transition hover:border-payscribe-blue hover:text-payscribe-blue"
            >
              Back to Dashboard
            </Link>
          }
        />

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {canViewLeads ? (
            <MetricCard label="Leads" value={leadRecords.length} />
          ) : null}
          {canViewTickets ? (
            <MetricCard label="Open Tickets" value={openTickets.length} />
          ) : null}
          {canViewBusinesses ? (
            <MetricCard label="At Risk Businesses" value={businessAttention.atRiskBusinesses.length} />
          ) : null}
          {canViewPartners ? (
            <MetricCard label="Active Partners" value={activePartners.length} />
          ) : null}
          {canViewProductLog ? (
            <MetricCard label="Active Product Events" value={activeProductEvents.length} />
          ) : null}
        </div>

        <form className="mt-6 rounded border border-neutral-200 bg-white p-4">
          <input type="hidden" name="tab" value={activeTab} />
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                From
              </span>
              <input
                type="date"
                name="from"
                defaultValue={from}
                className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                To
              </span>
              <input
                type="date"
                name="to"
                defaultValue={to}
                className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
              />
            </label>
            <button
              type="submit"
              className="rounded bg-payscribe-blue px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#254f93]"
            >
              Apply Filter
            </button>
            <Link
              href={`/reports?tab=${activeTab}`}
              className="rounded border border-neutral-300 bg-white px-4 py-2 text-center text-sm font-semibold text-neutral-800 transition hover:border-payscribe-blue hover:text-payscribe-blue"
            >
              Clear
            </Link>
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            Filters use each module&apos;s main record date: lead created date,
            ticket raised date, and created date for businesses, partners, and
            product events.
          </p>
        </form>

        <TabNavigation activeTab={activeTab} tabs={tabs} />

        <div className="mt-4 flex justify-end">
          <Link
            href={`/reports/export?${new URLSearchParams({
              ...Object.fromEntries(activeDateParams),
              tab: activeTab
            }).toString()}`}
            className="rounded border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 transition hover:border-payscribe-blue hover:text-payscribe-blue"
          >
            Export Current Tab CSV
          </Link>
        </div>

        {activeTab === "operations" ? (
          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            {canViewBusinesses ? (
              <>
                <ReportBreakdownTable
                  title="Businesses by Lifecycle Stage"
                  rows={businessLifecycleStages.map((stage) => [
                    stage,
                    businessRecords.filter((business) => business.lifecycle_stage === stage).length
                  ])}
                />
                <section className="rounded border border-neutral-200 bg-white p-5">
                  <h3 className="text-base font-semibold text-neutral-950">Business Attention</h3>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <MetricCard label="KYB Not Submitted" value={businessAttention.kybNotSubmitted48Hours.length} density="compact" />
                    <MetricCard label="No First Transaction" value={businessAttention.noFirstTransaction7Days.length} density="compact" />
                    <MetricCard label="Inactive 30+ Days" value={businessAttention.inactive30Days.length} density="compact" />
                    <MetricCard label="Near Limit" value={businessAttention.approachingTransactionLimit.length} density="compact" />
                  </div>
                </section>
                <ReportRecordTable
                  title="At Risk Businesses"
                  empty="No businesses are currently at risk."
                  rows={businessAttention.atRiskBusinesses.slice(0, 8).map((business) => ({
                    href: `/businesses/${business.business_id}`,
                    label: business.business_name,
                    meta: `${business.business_id} - ${business.lifecycle_stage}`,
                    value: business.assigned_cs_owner ? staffById.get(business.assigned_cs_owner) ?? "Unknown" : "Unassigned"
                  }))}
                />
              </>
            ) : null}

            {canViewTickets ? (
              <>
                <ReportBreakdownTable
                  title="Open Tickets by Priority"
                  rows={ticketPriorities.map((priority) => [
                    priority,
                    openTickets.filter((ticket) => ticket.priority === priority).length
                  ])}
                />
                <section className="rounded border border-neutral-200 bg-white p-5">
                  <h3 className="text-base font-semibold text-neutral-950">Ticket Health</h3>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <MetricCard label="Open Tickets" value={openTickets.length} density="compact" />
                    <MetricCard label="SLA Breached" value={breachedTickets.length} density="compact" />
                    <MetricCard label="SLA Breach Rate" value={percent(breachedTickets.length, openTickets.length)} density="compact" />
                    <MetricCard label="Avg Resolution" value={`${resolutionAverage.toFixed(1)}h`} density="compact" />
                  </div>
                </section>
              </>
            ) : null}
          </div>
        ) : null}

        {activeTab === "growth" && canViewLeads ? (
          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <section className="rounded border border-neutral-200 bg-white p-5">
              <h3 className="text-base font-semibold text-neutral-950">Growth Summary</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <MetricCard label="Pipeline Leads" value={leadRecords.length} density="compact" />
                <MetricCard label="Hot Leads" value={leadRecords.filter((lead) => lead.status === "Hot").length} density="compact" />
                <MetricCard label="Converted This Month" value={convertedThisMonth.length} density="compact" />
                <MetricCard label="Conversion Rate" value={percent(convertedThisMonth.length, convertedThisMonth.length + lostThisMonth.length)} density="compact" />
              </div>
            </section>
            <ReportBreakdownTable
              title="Leads by Stage"
              rows={leadStages.map((stage) => [
                stage,
                leadRecords.filter((lead) => lead.stage === stage).length
              ])}
            />
            <ReportBreakdownTable
              title="Leads by Source"
              rows={leadSources.map((source) => [
                source,
                leadRecords.filter((lead) => lead.source === source).length
              ])}
            />
            <ReportBreakdownTable
              title="Leads by Product Interest"
              rows={reportLeadProductOptions.map((product) => [
                product,
                leadRecords.filter((lead) => lead.product_interest.includes(product)).length
              ])}
            />
          </div>
        ) : null}

        {activeTab === "cs" && canViewTickets ? (
          <div className="mt-6 space-y-6">
            <section className="overflow-hidden rounded border border-neutral-200 bg-white">
              <div className="border-b border-neutral-200 px-4 py-3">
                <h3 className="text-base font-semibold text-neutral-950">CS Performance</h3>
                <p className="mt-1 text-sm text-neutral-600">
                  Ticket workload and resolution performance by team member.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-200 text-sm">
                  <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    <tr>
                      <th className="px-4 py-3">Team member</th>
                      <th className="px-4 py-3">Assigned</th>
                      <th className="px-4 py-3">Open</th>
                      <th className="px-4 py-3">Avg resolution</th>
                      <th className="px-4 py-3">SLA breach rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {staff.map((member) => {
                      const assigned = ticketRecords.filter(
                        (ticket) => ticket.assigned_to === member.user_id
                      );
                      const openAssigned = assigned.filter(isOpenTicket);
                      const averageResolution = average(
                        assigned
                          .map((ticket) => ticket.resolution_time_hours)
                          .filter((value): value is number => typeof value === "number")
                      );

                      return (
                        <tr key={member.user_id}>
                          <td className="px-4 py-4 font-medium text-neutral-950">{member.full_name}</td>
                          <td className="px-4 py-4 text-neutral-700">{assigned.length}</td>
                          <td className="px-4 py-4 text-neutral-700">{openAssigned.length}</td>
                          <td className="px-4 py-4 text-neutral-700">{averageResolution.toFixed(1)}h</td>
                          <td className="px-4 py-4 text-neutral-700">{percent(assigned.filter(isSlaBreached).length, openAssigned.length)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
            <ReportRecordTable
              title="Breached Tickets"
              empty="No open tickets have breached SLA."
              rows={breachedTickets.slice(0, 10).map((ticket) => ({
                href: `/tickets/${ticket.ticket_id}`,
                label: ticket.subject,
                meta: `${ticket.ticket_id} - ${ticket.issue_category}${ticket.sub_category ? ` / ${ticket.sub_category}` : ""}`,
                value: ticket.assigned_to ? staffById.get(ticket.assigned_to) ?? "Unknown" : "Unassigned"
              }))}
            />
          </div>
        ) : null}

        {activeTab === "partners" && canViewPartners ? (
          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <section className="rounded border border-neutral-200 bg-white p-5">
              <h3 className="text-base font-semibold text-neutral-950">Partner Summary</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <MetricCard label="Total Partners" value={partnerRecords.length} density="compact" />
                <MetricCard label="Active Partners" value={activePartners.length} density="compact" />
                <MetricCard label="Reviews This Week" value={partnerReviewsThisWeek.length} density="compact" />
                <MetricCard
                  label="Critical Identified"
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
            <ReportBreakdownTable
              title="Partners by Outreach Status"
              rows={partnerOutreachStatuses.map((status) => [
                status,
                partnerRecords.filter((partner) => partner.outreach_status === status).length
              ])}
            />
            <ReportRecordTable
              title="Reviews Due This Week"
              empty="No partner reviews are due this week."
              rows={partnerReviewsThisWeek.slice(0, 10).map((partner) => ({
                href: `/partners/${partner.partner_id}`,
                label: partner.organisation_name,
                meta: `${partner.partner_id} - ${partner.outreach_status}`,
                value: formatDate(partner.next_review_date)
              }))}
            />
          </div>
        ) : null}

        {activeTab === "product" && canViewProductLog ? (
          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <ReportBreakdownTable
              title="Events by Severity"
              rows={severities.map((severity) => [
                severity,
                productEventRecords.filter((event) => event.severity === severity).length
              ])}
            />
            <ReportBreakdownTable
              title="Events by Affected Product"
              rows={reportProductAreaOptions.map((area) => [
                area,
                productEventRecords.filter((event) => event.affected_products.includes(area)).length
              ])}
            />
            <section className="overflow-hidden rounded border border-neutral-200 bg-white xl:col-span-2">
              <div className="border-b border-neutral-200 px-4 py-3">
                <h3 className="text-base font-semibold text-neutral-950">Recent Product Events</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-neutral-200 text-sm">
                  <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    <tr>
                      <th className="px-4 py-3">Event</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Severity</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-200">
                    {productEventRecords.slice(0, 10).map((event) => (
                      <tr key={event.event_id}>
                        <td className="px-4 py-4">
                          <Link
                            href={`/product-log/${event.event_id}`}
                            className="font-semibold text-payscribe-blue hover:underline"
                          >
                            {event.title}
                          </Link>
                        </td>
                        <td className="px-4 py-4 text-neutral-700">{event.event_type}</td>
                        <td className="px-4 py-4 text-neutral-700">{event.severity ?? "Not set"}</td>
                        <td className="px-4 py-4 text-neutral-700">{event.status}</td>
                        <td className="px-4 py-4 text-neutral-700">{formatDate(event.created_at)}</td>
                      </tr>
                    ))}

                    {productEventRecords.length === 0 ? (
                      <EmptyTableRow colSpan={5} message="No product events found." />
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
