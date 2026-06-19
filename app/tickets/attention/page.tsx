import { AppShell } from "@/components/app-shell";
import { EmptyTableRow } from "@/components/ui/empty-table-row";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { formatDate } from "@/lib/format/date";
import { hasModulePermission } from "@/lib/permissions/checks";
import type { Business } from "@/lib/types/businesses";
import type { Ticket } from "@/lib/types/tickets";
import type { StaffUser } from "@/lib/types/users";
import Link from "next/link";
import { redirect } from "next/navigation";

type TicketAttentionTableProps = {
  title: string;
  description: string;
  tickets: Ticket[];
  businessById: Map<string, string>;
  staffById: Map<string, string>;
};

function isOpen(ticket: Ticket) {
  return ticket.status !== "Closed";
}

function isSlaBreached(ticket: Ticket) {
  return (
    Boolean(ticket.sla_deadline) &&
    new Date().getTime() > new Date(ticket.sla_deadline as string).getTime() &&
    isOpen(ticket)
  );
}

function isDueToday(ticket: Ticket) {
  if (!ticket.sla_deadline || !isOpen(ticket)) {
    return false;
  }

  const deadline = new Date(ticket.sla_deadline);
  const today = new Date();

  return (
    deadline.getFullYear() === today.getFullYear() &&
    deadline.getMonth() === today.getMonth() &&
    deadline.getDate() === today.getDate()
  );
}

function hoursUntil(value: string | null) {
  if (!value) {
    return null;
  }

  return Math.round((new Date(value).getTime() - Date.now()) / 3600000);
}

function TicketAttentionTable({
  title,
  description,
  tickets,
  businessById,
  staffById
}: TicketAttentionTableProps) {
  return (
    <section className="rounded border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-4 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-neutral-950">{title}</h3>
            <p className="mt-1 text-xs leading-5 text-neutral-600">
              {description}
            </p>
          </div>
          <span className="rounded bg-neutral-100 px-2 py-1 text-xs font-semibold text-neutral-700">
            {tickets.length}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3">Ticket</th>
              <th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Assigned</th>
              <th className="px-4 py-3">SLA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {tickets.map((ticket) => {
              const hours = hoursUntil(ticket.sla_deadline);

              return (
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
                    {ticket.business_id
                      ? businessById.get(ticket.business_id) ?? ticket.business_id
                      : "Unmatched email"}
                  </td>
                  <td className="px-4 py-4 text-neutral-700">
                    {ticket.priority}
                  </td>
                  <td className="px-4 py-4 text-neutral-700">
                    {ticket.status}
                  </td>
                  <td className="px-4 py-4 text-neutral-700">
                    {ticket.assigned_to
                      ? staffById.get(ticket.assigned_to) ?? "Unknown"
                      : "Unassigned"}
                  </td>
                  <td className="px-4 py-4 text-neutral-700">
                    <div>{formatDate(ticket.sla_deadline)}</div>
                    {hours !== null ? (
                      <div
                        className={`mt-1 text-xs font-semibold ${
                          hours < 0 ? "text-red-700" : "text-neutral-500"
                        }`}
                      >
                        {hours < 0
                          ? `${Math.abs(hours)}h overdue`
                          : `${hours}h remaining`}
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}

            {tickets.length === 0 ? (
              <EmptyTableRow
                colSpan={6}
                message="Nothing needs attention here."
              />
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function TicketAttentionPage() {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();

  if (!hasModulePermission(currentUser, permissions, "Tickets", "can_view")) {
    redirect("/");
  }

  const [{ data: tickets }, { data: businesses }, { data: staffMembers }] =
    await Promise.all([
      supabase
        .from("tickets")
        .select("*")
        .order("sla_deadline", { ascending: true })
        .returns<Ticket[]>(),
      supabase.from("businesses").select("*").returns<Business[]>(),
      supabase.from("users").select("*").returns<StaffUser[]>()
    ]);

  const records = tickets ?? [];
  const businessById = new Map(
    (businesses ?? []).map((business) => [
      business.business_id,
      business.business_name
    ])
  );
  const staffById = new Map(
    (staffMembers ?? []).map((staffMember) => [
      staffMember.user_id,
      staffMember.full_name
    ])
  );

  const breachedTickets = records.filter(isSlaBreached);
  const dueTodayTickets = records.filter(isDueToday);
  const highCriticalOpenTickets = records.filter(
    (ticket) => isOpen(ticket) && ticket.priority === "Critical"
  );
  const recurringIssues = records.filter(
    (ticket) => isOpen(ticket) && ticket.recurring_issue
  );

  return (
    <AppShell currentUser={currentUser} permissions={permissions}>
      <section>
        <PageHeader
          eyebrow="Tickets"
          title="Ticket Attention Center"
          description="Operational ticket views for SLA breach risk, high-priority complaints, waiting items, and recurring product issues."
          actions={
          <Link
            href="/tickets"
            className="rounded border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 transition hover:border-payscribe-blue hover:text-payscribe-blue"
          >
            Queue
          </Link>
          }
        />

        <div className="mt-6 grid gap-4 md:grid-cols-5">
          {[
            ["SLA Breached", breachedTickets.length],
            ["SLA Due Today", dueTodayTickets.length],
            ["Critical Open", highCriticalOpenTickets.length],
            ["Recurring Issues", recurringIssues.length]
          ].map(([label, value]) => (
            <MetricCard
              key={label}
              label={String(label)}
              value={value}
              density="compact"
            />
          ))}
        </div>

        <div className="mt-6 space-y-6">
          <TicketAttentionTable
            title="SLA Breached"
            description="Open tickets whose SLA deadline has already passed."
            tickets={breachedTickets}
            businessById={businessById}
            staffById={staffById}
          />

          <TicketAttentionTable
            title="Tickets Breaching SLA Today"
            description="Open tickets with SLA deadlines today."
            tickets={dueTodayTickets}
            businessById={businessById}
            staffById={staffById}
          />

          <TicketAttentionTable
            title="Critical Open Tickets"
            description="Open tickets that need close operational tracking because of priority."
            tickets={highCriticalOpenTickets}
            businessById={businessById}
            staffById={staffById}
          />

          <TicketAttentionTable
            title="Recurring Product Issues"
            description="Open tickets marked as recurring for product team attention."
            tickets={recurringIssues}
            businessById={businessById}
            staffById={staffById}
          />
        </div>
      </section>
    </AppShell>
  );
}
