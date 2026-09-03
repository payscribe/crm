import { AppShell } from "@/components/app-shell";
import { RichTextContent } from "@/components/tickets/rich-text-content";
import { EmptyTableRow } from "@/components/ui/empty-table-row";
import { PageHeader } from "@/components/ui/page-header";
import { SubmitButton } from "@/components/ui/submit-button";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { formatDate } from "@/lib/format/date";
import { hasModulePermission } from "@/lib/permissions/checks";
import type { Business } from "@/lib/types/businesses";
import type { TicketDocumentation } from "@/lib/types/ticket-documentation";
import type { Ticket } from "@/lib/types/tickets";
import type { StaffUser } from "@/lib/types/users";
import Link from "next/link";
import { redirect } from "next/navigation";

type TicketDocumentationPageProps = {
  searchParams?: { q?: string };
};

export default async function TicketDocumentationPage({ searchParams }: TicketDocumentationPageProps) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();
  if (!hasModulePermission(currentUser, permissions, "Tickets", "can_view")) {
    redirect("/");
  }

  const query = searchParams?.q?.trim() ?? "";
  let documentationQuery = supabase.from("ticket_documentation").select("*");
  if (query) {
    documentationQuery = documentationQuery.or(
      `title.ilike.%${query}%,content_html.ilike.%${query}%,ticket_id.ilike.%${query}%`
    );
  }

  const [
    { data: documentation },
    { data: tickets },
    { data: businesses },
    { data: staffMembers }
  ] = await Promise.all([
    documentationQuery.order("updated_at", { ascending: false }).returns<TicketDocumentation[]>(),
    supabase.from("tickets").select("*").returns<Ticket[]>(),
    supabase.from("businesses").select("*").returns<Business[]>(),
    supabase.from("users").select("*").returns<StaffUser[]>()
  ]);

  const ticketById = new Map((tickets ?? []).map((ticket) => [ticket.ticket_id, ticket]));
  const businessById = new Map((businesses ?? []).map((business) => [business.business_id, business.business_name]));
  const staffById = new Map((staffMembers ?? []).map((staff) => [staff.user_id, staff.full_name]));
  const records = documentation ?? [];

  return (
    <AppShell currentUser={currentUser} permissions={permissions}>
      <section>
        <PageHeader
          eyebrow="Tickets"
          title="Ticket Documentation"
          description="A searchable record of how support tickets were investigated and resolved. Documentation is created and maintained from each ticket."
        />

        <form className="mt-6 flex flex-col gap-3 rounded border border-neutral-200 bg-white p-4 sm:flex-row">
          <input
            name="q"
            defaultValue={query}
            placeholder="Search documentation or ticket ID"
            className="min-w-0 flex-1 rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
          />
          <SubmitButton variant="dark" pendingText="Searching...">Search</SubmitButton>
          {query ? (
            <Link href="/ticket-documentation" className="rounded border border-neutral-300 px-4 py-2 text-center text-sm font-semibold text-neutral-700 hover:border-payscribe-blue hover:text-payscribe-blue">
              Clear
            </Link>
          ) : null}
        </form>

        <div className="mt-6 overflow-hidden rounded border border-neutral-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Documentation</th>
                  <th className="px-4 py-3">Ticket</th>
                  <th className="px-4 py-3">Business</th>
                  <th className="px-4 py-3">Updated by</th>
                  <th className="px-4 py-3">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 align-top">
                {records.map((record) => {
                  const ticket = ticketById.get(record.ticket_id);
                  return (
                    <tr key={record.documentation_id}>
                      <td className="max-w-xl px-4 py-4">
                        <Link href={`/tickets/${record.ticket_id}`} className="font-semibold text-payscribe-blue hover:underline">
                          {record.title}
                        </Link>
                        <RichTextContent html={record.content_html} className="mt-2 line-clamp-3" />
                      </td>
                      <td className="px-4 py-4">
                        <Link href={`/tickets/${record.ticket_id}`} className="font-semibold text-neutral-900 hover:text-payscribe-blue hover:underline">
                          {record.ticket_id}
                        </Link>
                        <div className="mt-1 max-w-xs text-xs text-neutral-500">{ticket?.subject ?? "Ticket unavailable"}</div>
                      </td>
                      <td className="px-4 py-4 text-neutral-700">
                        {ticket?.business_id ? businessById.get(ticket.business_id) ?? ticket.business_id : "—"}
                      </td>
                      <td className="px-4 py-4 text-neutral-700">{record.updated_by ? staffById.get(record.updated_by) ?? "Unknown" : "—"}</td>
                      <td className="whitespace-nowrap px-4 py-4 text-neutral-700">{formatDate(record.updated_at)}</td>
                    </tr>
                  );
                })}
                {records.length === 0 ? <EmptyTableRow colSpan={5} message="No ticket documentation found." /> : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
