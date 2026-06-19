import { AppShell } from "@/components/app-shell";
import { EmptyTableRow } from "@/components/ui/empty-table-row";
import { StatusAlert } from "@/components/ui/status-alert";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { formatNaira } from "@/lib/format/currency";
import { formatDate } from "@/lib/format/date";
import { hasModulePermission } from "@/lib/permissions/checks";
import type { Business } from "@/lib/types/businesses";
import type { Lead } from "@/lib/types/leads";
import type { Ticket } from "@/lib/types/tickets";
import type { StaffUser } from "@/lib/types/users";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

type BusinessDetailPageProps = {
  params: {
    businessId: string;
  };
  searchParams?: {
    error?: string;
    success?: string;
  };
};

function DetailItem({
  label,
  value
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="rounded border border-neutral-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-neutral-950">
        {value || "Not available"}
      </p>
    </div>
  );
}

export default async function BusinessDetailPage({
  params,
  searchParams
}: BusinessDetailPageProps) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();

  if (!hasModulePermission(currentUser, permissions, "Businesses", "can_view")) {
    redirect("/");
  }

  const [
    { data: business },
    { data: staffMembers },
    { data: tickets },
    { data: linkedLeads }
  ] = await Promise.all([
    supabase
      .from("businesses")
      .select("*")
      .eq("business_id", params.businessId)
      .single<Business>(),
    supabase
      .from("users")
      .select("*")
      .eq("status", "Active")
      .order("full_name", { ascending: true })
      .returns<StaffUser[]>(),
    supabase
      .from("tickets")
      .select("*")
      .eq("business_id", params.businessId)
      .order("date_raised", { ascending: false })
      .returns<Ticket[]>(),
    supabase
      .from("leads")
      .select("*")
      .eq("linked_business_id", params.businessId)
      .order("created_at", { ascending: false })
      .returns<Lead[]>()
  ]);

  if (!business) {
    notFound();
  }

  const staffById = new Map(
    (staffMembers ?? []).map((staffMember) => [
      staffMember.user_id,
      staffMember.full_name
    ])
  );

  return (
    <AppShell currentUser={currentUser} permissions={permissions}>
      <section>
        <div className="flex flex-col gap-4 border-b border-neutral-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-payscribe-blue">
              {business.business_id}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-normal text-neutral-950">
              {business.business_name}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
              Read-only business profile from the platform data source, with CRM
              ticket and lead history.
            </p>
          </div>
          <Link
            href="/businesses"
            className="rounded border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 transition hover:border-payscribe-blue hover:text-payscribe-blue"
          >
            Back to Businesses
          </Link>
        </div>

        <StatusAlert type="error" message={searchParams?.error} />
        <StatusAlert type="success" message={searchParams?.success} />

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <DetailItem label="Lifecycle stage" value={business.lifecycle_stage} />
          <DetailItem label="KYB status" value={business.kyb_status} />
          <DetailItem
            label="CS owner"
            value={
              business.assigned_cs_owner
                ? staffById.get(business.assigned_cs_owner) ?? "Unknown"
                : "Unassigned"
            }
          />
          <DetailItem label="Owner" value={business.owner_name} />
          <DetailItem label="Email" value={business.email} />
          <DetailItem label="Phone" value={business.phone} />
          <DetailItem
            label="Registration date"
            value={formatDate(business.registration_date)}
          />
          <DetailItem
            label="Last transaction"
            value={formatDate(business.last_transaction_date)}
          />
          <DetailItem
            label="Current volume"
            value={formatNaira(business.current_transaction_volume)}
          />
          <DetailItem
            label="Monthly volume range"
            value={business.monthly_volume_range}
          />
          <DetailItem
            label="Integration type"
            value={business.integration_type}
          />
          <DetailItem
            label="Settlement type"
            value={business.settlement_type}
          />
        </div>

        <div className="mt-6 rounded border border-neutral-200 bg-white p-5">
          <h3 className="text-base font-semibold text-neutral-950">
            Active Products
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {(business.products_active ?? []).map((product) => (
              <span
                key={product}
                className="rounded border border-neutral-200 px-2 py-1 text-xs font-semibold text-neutral-700"
              >
                {product}
              </span>
            ))}
            {(business.products_active ?? []).length === 0 ? (
              <span className="text-sm text-neutral-600">No products listed.</span>
            ) : null}
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded border border-neutral-200 bg-white">
          <div className="border-b border-neutral-200 px-4 py-3">
            <h3 className="text-base font-semibold text-neutral-950">
              Ticket History
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Ticket</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Assigned</th>
                  <th className="px-4 py-3">Raised</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {(tickets ?? []).map((ticket) => (
                  <tr key={ticket.ticket_id}>
                    <td className="px-4 py-4">
                      <Link
                        href={`/tickets/${ticket.ticket_id}`}
                        className="font-semibold text-payscribe-blue hover:underline"
                      >
                        {ticket.subject}
                      </Link>
                      <div className="mt-1 text-xs text-neutral-500">
                        {ticket.ticket_id}
                      </div>
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
                      {formatDate(ticket.date_raised)}
                    </td>
                  </tr>
                ))}
                {(tickets ?? []).length === 0 ? (
                  <EmptyTableRow colSpan={5} message="No tickets linked yet." />
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded border border-neutral-200 bg-white">
          <div className="border-b border-neutral-200 px-4 py-3">
            <h3 className="text-base font-semibold text-neutral-950">
              Linked Leads
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Lead</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Assigned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {(linkedLeads ?? []).map((lead) => (
                  <tr key={lead.lead_id}>
                    <td className="px-4 py-4">
                      <Link
                        href={`/leads/${lead.lead_id}`}
                        className="font-semibold text-payscribe-blue hover:underline"
                      >
                        {lead.full_name}
                      </Link>
                      <div className="mt-1 text-xs text-neutral-500">
                        {lead.lead_id}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {lead.stage}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {lead.status}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {staffById.get(lead.assigned_to) ?? "Unknown"}
                    </td>
                  </tr>
                ))}
                {(linkedLeads ?? []).length === 0 ? (
                  <EmptyTableRow colSpan={4} message="No leads linked yet." />
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
