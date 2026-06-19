import { AppShell } from "@/components/app-shell";
import { PartnerTypeField } from "@/components/partners/partner-type-field";
import { EmptyTableRow } from "@/components/ui/empty-table-row";
import { FormModal } from "@/components/ui/form-modal";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusAlert } from "@/components/ui/status-alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import {
  partnerOutreachStatuses,
  partnerPriorities,
  partnerTags,
  partnerTypes
} from "@/lib/constants/partners";
import { formatDate } from "@/lib/format/date";
import { hasModulePermission } from "@/lib/permissions/checks";
import type {
  Partner,
  PartnerOutreachStatus,
  PartnerPriority,
  PartnerType
} from "@/lib/types/partners";
import type { StaffUser } from "@/lib/types/users";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createPartner } from "./actions";

type PartnersPageProps = {
  searchParams?: {
    q?: string;
    status?: string;
    type?: string;
    priority?: string;
    error?: string;
    success?: string;
  };
};

function isReviewDue(partner: Partner) {
  if (!partner.would_revisit || !partner.next_review_date) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(partner.next_review_date).getTime() <= today.getTime();
}

function displayPartnerType(partner: Partner) {
  return partner.partner_type === "Other" && partner.custom_partner_type
    ? partner.custom_partner_type
    : partner.partner_type;
}

export default async function PartnersPage({ searchParams }: PartnersPageProps) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();

  if (!hasModulePermission(currentUser, permissions, "Partners", "can_view")) {
    redirect("/");
  }

  const canCreate = hasModulePermission(
    currentUser,
    permissions,
    "Partners",
    "can_create"
  );

  const query = searchParams?.q?.trim() ?? "";
  const status = searchParams?.status ?? "";
  const type = searchParams?.type ?? "";
  const priority = searchParams?.priority ?? "";

  let partnersQuery = supabase.from("partners").select("*");

  if (query) {
    partnersQuery = partnersQuery.or(
      `partner_id.ilike.%${query}%,organisation_name.ilike.%${query}%,country.ilike.%${query}%,their_contact_name.ilike.%${query}%,custom_partner_type.ilike.%${query}%`
    );
  }

  if (partnerOutreachStatuses.includes(status as PartnerOutreachStatus)) {
    partnersQuery = partnersQuery.eq("outreach_status", status);
  }

  if (partnerTypes.includes(type as PartnerType)) {
    partnersQuery = partnersQuery.eq("partner_type", type);
  }

  if (partnerPriorities.includes(priority as PartnerPriority)) {
    partnersQuery = partnersQuery.eq("priority", priority);
  }

  const [{ data: partners }, { data: staffMembers }] = await Promise.all([
    partnersQuery.order("updated_at", { ascending: false }).returns<Partner[]>(),
    supabase
      .from("users")
      .select("*")
      .eq("status", "Active")
      .order("full_name", { ascending: true })
      .returns<StaffUser[]>()
  ]);

  const records = partners ?? [];
  const staffById = new Map(
    (staffMembers ?? []).map((staffMember) => [
      staffMember.user_id,
      staffMember.full_name
    ])
  );
  const activePartners = records.filter(
    (partner) => partner.outreach_status === "Active Partner"
  );
  const criticalPartners = records.filter(
    (partner) => partner.priority === "Critical"
  );
  const reviewDuePartners = records.filter(isReviewDue);
  const needsReassignment = records.filter((partner) => partner.needs_reassignment);

  return (
    <AppShell currentUser={currentUser} permissions={permissions}>
      <section>
        <PageHeader
          eyebrow="Partners"
          title="Partner Tracking"
          description="Track partner outreach, relationship ownership, review dates, and interaction history."
        />

        <StatusAlert type="error" message={searchParams?.error} />
        <StatusAlert type="success" message={searchParams?.success} />

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Total Partners", records.length],
            ["Active Partners", activePartners.length],
            ["Critical Priority", criticalPartners.length],
            ["Review Due", reviewDuePartners.length],
            ["Reassignment Needed", needsReassignment.length]
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
              buttonLabel="Add New Partner"
              title="Add Partner"
              description="Required fields are organisation name and partner type."
            >
              <form action={createPartner}>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="block">
                <span className="text-sm font-medium text-neutral-800">
                  Organisation name
                </span>
                <input
                  required
                  name="organisation_name"
                  className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                />
              </label>

              <div className="md:col-span-2">
                <PartnerTypeField />
              </div>

              <label className="block">
                <span className="text-sm font-medium text-neutral-800">
                  Owner
                </span>
                <select
                  name="payscribe_contact"
                  className="mt-2 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                >
                  <option value="">Unassigned</option>
                  {(staffMembers ?? []).map((staffMember) => (
                    <option
                      key={staffMember.user_id}
                      value={staffMember.user_id}
                    >
                      {staffMember.full_name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-neutral-800">
                  Status
                </span>
                <select
                  name="outreach_status"
                  defaultValue="Identified"
                  className="mt-2 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                >
                  {partnerOutreachStatuses.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-neutral-800">
                  Priority
                </span>
                <select
                  name="priority"
                  className="mt-2 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                >
                  <option value="">No priority</option>
                  {partnerPriorities.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-neutral-800">
                  Website
                </span>
                <input
                  name="website"
                  className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-neutral-800">
                  Country
                </span>
                <input
                  name="country"
                  className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-neutral-800">
                  Contact name
                </span>
                <input
                  name="their_contact_name"
                  className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                />
              </label>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-neutral-800">
                  Service description
                </span>
                <textarea
                  name="service_description"
                  rows={3}
                  className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-neutral-800">
                  Reason for outreach
                </span>
                <textarea
                  name="reason_for_outreach"
                  rows={3}
                  className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                />
              </label>
            </div>

            <fieldset className="mt-5">
              <legend className="text-sm font-medium text-neutral-800">
                Tags
              </legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {partnerTags.map((tag) => (
                  <label
                    key={tag}
                    className="flex items-center gap-2 rounded border border-neutral-200 px-3 py-2 text-sm text-neutral-700"
                  >
                    <input
                      type="checkbox"
                      name="tags"
                      value={tag}
                      className="h-4 w-4 accent-payscribe-blue"
                    />
                    <span>{tag}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="mt-5 flex justify-end">
              <SubmitButton pendingText="Saving partner...">
                Save Partner
              </SubmitButton>
            </div>
              </form>
            </FormModal>
          </div>
        ) : null}

        <div className="mt-6 rounded border border-neutral-200 bg-white p-4">
          <form className="grid gap-3 lg:grid-cols-[1fr_210px_230px_170px_auto]">
            <input
              name="q"
              defaultValue={query}
              placeholder="Search by organisation, country, contact, or ID"
              className="rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
            />
            <select
              name="status"
              defaultValue={status}
              className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
            >
              <option value="">All statuses</option>
              {partnerOutreachStatuses.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              name="type"
              defaultValue={type}
              className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
            >
              <option value="">All types</option>
              {partnerTypes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              name="priority"
              defaultValue={priority}
              className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
            >
              <option value="">All priorities</option>
              {partnerPriorities.map((item) => (
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
                  <th className="px-4 py-3">Partner</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {records.map((partner) => (
                  <tr key={partner.partner_id}>
                    <td className="px-4 py-4">
                      <Link
                        href={`/partners/${partner.partner_id}`}
                        className="font-semibold text-payscribe-blue hover:underline"
                      >
                        {partner.organisation_name}
                      </Link>
                      <div className="mt-1 text-xs text-neutral-500">
                        {partner.partner_id} - {partner.country ?? "No country"}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {displayPartnerType(partner)}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {partner.outreach_status}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {partner.priority ?? "Not set"}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {partner.payscribe_contact
                        ? staffById.get(partner.payscribe_contact) ?? "Unknown"
                        : "Unassigned"}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      <div>{formatDate(partner.next_review_date)}</div>
                      {isReviewDue(partner) ? (
                        <div className="mt-1 text-xs font-semibold text-red-700">
                          Due
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}

                {records.length === 0 ? (
                  <EmptyTableRow colSpan={6} message="No partners found." />
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
