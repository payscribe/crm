import { AppShell } from "@/components/app-shell";
import { NewTicketForm } from "@/components/tickets/new-ticket-form";
import { createTicket } from "@/app/tickets/actions";
import { EmptyTableRow } from "@/components/ui/empty-table-row";
import { FormModal } from "@/components/ui/form-modal";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusAlert } from "@/components/ui/status-alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import type { Business } from "@/lib/types/businesses";
import {
  ticketCategories,
  ticketPriorities,
  ticketStatuses
} from "@/lib/constants/tickets";
import { formatDate } from "@/lib/format/date";
import { hasModulePermission } from "@/lib/permissions/checks";
import { getTicketSubCategoryOptionsByCategory } from "@/lib/settings/managed-options";
import type {
  Ticket,
  TicketPriority,
  TicketStatus
} from "@/lib/types/tickets";
import type { StaffUser } from "@/lib/types/users";
import Link from "next/link";
import { redirect } from "next/navigation";

type TicketsPageProps = {
  searchParams?: {
    q?: string;
    priority?: string;
    status?: string;
    category?: string;
    error?: string;
    success?: string;
  };
};

function isSlaBreached(ticket: Ticket) {
  return (
    Boolean(ticket.sla_deadline) &&
    new Date().getTime() > new Date(ticket.sla_deadline as string).getTime() &&
    ticket.status !== "Closed"
  );
}

function isDueToday(ticket: Ticket) {
  if (!ticket.sla_deadline || ticket.status === "Closed") {
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

export default async function TicketsPage({ searchParams }: TicketsPageProps) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();

  if (!hasModulePermission(currentUser, permissions, "Tickets", "can_view")) {
    redirect("/");
  }

  const canCreate = hasModulePermission(
    currentUser,
    permissions,
    "Tickets",
    "can_create"
  );

  const query = searchParams?.q?.trim() ?? "";
  const priority = searchParams?.priority ?? "";
  const status = searchParams?.status ?? "";
  const category = searchParams?.category ?? "";

  let ticketsQuery = supabase.from("tickets").select("*");

  if (query) {
    ticketsQuery = ticketsQuery.or(
      `ticket_id.ilike.%${query}%,reported_by.ilike.%${query}%,subject.ilike.%${query}%,sub_category.ilike.%${query}%,issue_description.ilike.%${query}%`
    );
  }

  if (ticketPriorities.includes(priority as TicketPriority)) {
    ticketsQuery = ticketsQuery.eq("priority", priority);
  }

  if (ticketStatuses.includes(status as TicketStatus)) {
    ticketsQuery = ticketsQuery.eq("status", status);
  }

  if (ticketCategories.includes(category as never)) {
    ticketsQuery = ticketsQuery.eq("issue_category", category);
  }

  const [
    { data: tickets },
    { data: businesses },
    { data: staffMembers },
    subCategoriesByCategory
  ] =
    await Promise.all([
      ticketsQuery.order("date_raised", { ascending: false }).returns<Ticket[]>(),
      supabase
        .from("businesses")
        .select("*")
        .order("business_name", { ascending: true })
        .returns<Business[]>(),
      supabase
        .from("users")
        .select("*")
        .eq("status", "Active")
        .order("full_name", { ascending: true })
        .returns<StaffUser[]>(),
      getTicketSubCategoryOptionsByCategory(supabase)
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

  const openTickets = records.filter(
    (ticket) => ticket.status !== "Closed"
  );
  const highPriorityTickets = records.filter(
    (ticket) => ticket.priority === "Critical"
  );
  const breachedTickets = records.filter(isSlaBreached);
  const dueTodayTickets = records.filter(isDueToday);

  return (
    <AppShell currentUser={currentUser} permissions={permissions}>
      <section>
        <PageHeader
          eyebrow="Tickets"
          title="Complaint Queue"
          description="Track customer issues, ownership, priority, SLA deadlines, and resolution notes."
          actions={
            <Link
              href="/tickets/attention"
              className="rounded bg-payscribe-blue px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#254f93]"
            >
              Attention Center
            </Link>
          }
        />

        <StatusAlert type="error" message={searchParams?.error} />
        <StatusAlert type="success" message={searchParams?.success} />

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Open Tickets", openTickets.length],
            ["Critical", highPriorityTickets.length],
            ["SLA Breached", breachedTickets.length],
            ["SLA Due Today", dueTodayTickets.length]
          ].map(([label, value]) => (
            <MetricCard
              key={label}
              label={String(label)}
              value={value}
              density="compact"
            />
          ))}
        </div>

        {canCreate ? (
          <div className="mt-6 flex justify-end">
            <FormModal
              buttonLabel="Add New Ticket"
              title="New Ticket"
              description="Open tickets can be assigned and escalated. Closed tickets are saved as Low priority with no assignee or Slack escalation."
            >
              <NewTicketForm
                action={createTicket}
                businesses={businesses ?? []}
                staffMembers={staffMembers ?? []}
                subCategoriesByCategory={subCategoriesByCategory}
              />
            </FormModal>
          </div>
        ) : null}

        <div className="mt-6 rounded border border-neutral-200 bg-white p-4">
          <form className="grid gap-3 lg:grid-cols-[1fr_180px_180px_210px_auto]">
            <input
              name="q"
              defaultValue={query}
              placeholder="Search by ticket ID, subject, reporter, or description"
              className="rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
            />
            <select
              name="priority"
              defaultValue={priority}
              className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
            >
              <option value="">All priorities</option>
              {ticketPriorities.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              name="status"
              defaultValue={status}
              className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
            >
              <option value="">All statuses</option>
              {ticketStatuses.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              name="category"
              defaultValue={category}
              className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
            >
              <option value="">All categories</option>
              {ticketCategories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <SubmitButton variant="dark" pendingText="Filtering...">
              Filter
            </SubmitButton>
          </form>
        </div>

        <div className="mt-6 overflow-hidden rounded border border-neutral-200 bg-white">
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
                {records.map((ticket) => (
                  <tr key={ticket.ticket_id}>
                    <td className="px-4 py-4">
                      <Link
                        href={`/tickets/${ticket.ticket_id}`}
                        className="font-semibold text-payscribe-blue hover:underline"
                      >
                        {ticket.subject}
                      </Link>
                      <div className="mt-1 text-xs text-neutral-500">
                        {ticket.ticket_id} - {ticket.issue_category}
                        {ticket.sub_category ? ` / ${ticket.sub_category}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {ticket.business_id
                        ? businessById.get(ticket.business_id) ?? ticket.business_id
                        : "Unmatched email"}
                    </td>
                    <td className="px-4 py-4">
                      <span className="rounded border border-neutral-200 px-2 py-1 text-xs font-semibold text-neutral-700">
                        {ticket.priority}
                      </span>
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
                      {isSlaBreached(ticket) ? (
                        <div className="mt-1 text-xs font-semibold text-red-700">
                          Breached
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}

                {records.length === 0 ? (
                  <EmptyTableRow colSpan={6} message="No tickets found." />
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
