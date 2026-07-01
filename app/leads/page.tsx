import { AppShell } from "@/components/app-shell";
import { EmptyTableRow } from "@/components/ui/empty-table-row";
import { FormModal } from "@/components/ui/form-modal";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusAlert } from "@/components/ui/status-alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import {
  leadSources,
  leadStages,
  leadStatuses
} from "@/lib/constants/leads";
import { formatDate } from "@/lib/format/date";
import { hasModulePermission } from "@/lib/permissions/checks";
import { getLeadProductInterestOptions } from "@/lib/settings/managed-options";
import type { Lead, LeadStage, LeadStatus } from "@/lib/types/leads";
import type { StaffUser } from "@/lib/types/users";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DownloadTemplateButton } from "@/components/leads/download-template-button";
import { bulkUploadLeads, createLead } from "./actions";

type LeadsPageProps = {
  searchParams?: {
    q?: string;
    stage?: string;
    status?: string;
    source?: string;
    error?: string;
    success?: string;
  };
};

function isOverdue(date: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(date).getTime() < today.getTime();
}

export default async function LeadsPage({ searchParams }: LeadsPageProps) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();

  if (!hasModulePermission(currentUser, permissions, "Leads", "can_view")) {
    redirect("/");
  }

  const canCreate = hasModulePermission(
    currentUser,
    permissions,
    "Leads",
    "can_create"
  );

  const query = searchParams?.q?.trim() ?? "";
  const stage = searchParams?.stage ?? "";
  const status = searchParams?.status ?? "";
  const source = searchParams?.source ?? "";

  let leadsQuery = supabase.from("leads").select("*");

  if (query) {
    leadsQuery = leadsQuery.or(
      `lead_id.ilike.%${query}%,full_name.ilike.%${query}%,business_name.ilike.%${query}%,phone.ilike.%${query}%,email.ilike.%${query}%`
    );
  }

  if (leadStages.includes(stage as LeadStage)) {
    leadsQuery = leadsQuery.eq("stage", stage);
  }

  if (leadStatuses.includes(status as LeadStatus)) {
    leadsQuery = leadsQuery.eq("status", status);
  }

  if (leadSources.includes(source as never)) {
    leadsQuery = leadsQuery.eq("source", source);
  }

  const [{ data: leads }, { data: staffMembers }, productInterestOptions] = await Promise.all([
    leadsQuery.order("created_at", { ascending: false }).returns<Lead[]>(),
    supabase
      .from("users")
      .select("*")
      .eq("status", "Active")
      .order("full_name", { ascending: true })
      .returns<StaffUser[]>(),
    getLeadProductInterestOptions(supabase)
  ]);

  const records = leads ?? [];
  const staffById = new Map(
    (staffMembers ?? []).map((staffMember) => [
      staffMember.user_id,
      staffMember.full_name
    ])
  );

  const hotLeads = records.filter((lead) => lead.status === "Hot");
  const warmLeads = records.filter((lead) => lead.status === "Warm");
  const coldLeads = records.filter((lead) => lead.status === "Cold");
  const qualifiedLeads = records.filter((lead) =>
    ["Qualified", "Demo Scheduled"].includes(lead.stage)
  );
  const onboardingLeads = records.filter((lead) => lead.stage === "Onboarding");
  const overdueLeads = records.filter(
    (lead) =>
      !["Closed Won", "Closed Lost"].includes(lead.status) &&
      isOverdue(lead.next_followup_date)
  );

  return (
    <AppShell currentUser={currentUser} permissions={permissions}>
      <section>
        <PageHeader
          eyebrow="Leads"
          title="Lead Pipeline"
          description="Capture prospects, assign ownership, track follow-ups, and monitor pipeline status."
          actions={
            <>
            <Link
              href="/leads/attention"
              className="rounded border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 transition hover:border-payscribe-blue hover:text-payscribe-blue"
            >
              Attention Center
            </Link>
            <Link
              href="/leads/pipeline"
              className="rounded bg-payscribe-blue px-4 py-2 text-sm font-semibold text-white"
            >
              Pipeline View
            </Link>
            </>
          }
        />

        <StatusAlert type="error" message={searchParams?.error} />
        <StatusAlert type="success" message={searchParams?.success} />

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Total Leads", records.length],
            ["Hot Leads", hotLeads.length],
            ["Warm Leads", warmLeads.length],
            ["Cold Leads", coldLeads.length],
            ["Qualified", qualifiedLeads.length],
            ["Onboarding", onboardingLeads.length],
            ["Overdue Follow-ups", overdueLeads.length]
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
          <div className="mt-6 flex justify-end gap-3">
            <FormModal
              buttonLabel="Import CSV"
              title="Bulk Import Leads"
              size="default"
              description="Upload a CSV to import multiple leads at once. Rows missing full_name or phone are skipped."
            >
              <form action={bulkUploadLeads} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-800">
                    CSV file
                  </label>
                  <input
                    required
                    type="file"
                    name="csv_file"
                    accept=".csv,text/csv"
                    className="mt-2 block w-full text-sm text-neutral-700 file:mr-3 file:rounded file:border file:border-neutral-300 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-neutral-700 hover:file:border-payscribe-blue hover:file:text-payscribe-blue"
                  />
                </div>
                <div className="rounded border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-600 leading-5">
                  <strong className="text-neutral-800">Required columns:</strong> <code>full_name</code>, <code>phone</code><br />
                  <strong className="text-neutral-800">Optional columns:</strong> <code>business_name</code>, <code>email</code>, <code>source</code>, <code>referral_source_name</code>, <code>product_interest</code>, <code>stage</code>, <code>status</code>, <code>assigned_to_email</code>, <code>next_followup_date</code>, <code>last_message_summary</code>, <code>notes</code>
                </div>
                <div className="flex items-center justify-between">
                  <DownloadTemplateButton />
                  <SubmitButton pendingText="Importing...">Import Leads</SubmitButton>
                </div>
              </form>
            </FormModal>
            <FormModal
              buttonLabel="Add New Lead"
              title="Add Lead"
              description="Required fields are name, phone, source, product interest, assignee, and next follow-up date."
            >
              <form
                action={createLead}
                className="space-y-0"
          >
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label className="block">
                <span className="text-sm font-medium text-neutral-800">
                  Full name
                </span>
                <input
                  required
                  name="full_name"
                  className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-neutral-800">
                  Business name
                </span>
                <input
                  name="business_name"
                  className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-neutral-800">
                  Phone
                </span>
                <input
                  required
                  name="phone"
                  className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-neutral-800">
                  Email
                </span>
                <input
                  name="email"
                  type="email"
                  className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-neutral-800">
                  Source
                </span>
                <select
                  required
                  name="source"
                  className="mt-2 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                >
                  <option value="">Select source</option>
                  {leadSources.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-neutral-800">
                  Referral source name
                </span>
                <input
                  name="referral_source_name"
                  className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-neutral-800">
                  Stage
                </span>
                <select
                  name="stage"
                  defaultValue="New"
                  className="mt-2 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                >
                  {leadStages.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-neutral-800">
                  Status
                </span>
                <select
                  name="status"
                  defaultValue="Warm"
                  className="mt-2 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                >
                  {leadStatuses.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-neutral-800">
                  Assigned to
                </span>
                <select
                  required
                  name="assigned_to"
                  className="mt-2 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                >
                  <option value="">Select team member</option>
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
                  Next follow-up date
                </span>
                <input
                  required
                  name="next_followup_date"
                  type="date"
                  className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                />
              </label>

              <label className="block xl:col-span-2">
                <span className="text-sm font-medium text-neutral-800">
                  Last message summary
                </span>
                <input
                  name="last_message_summary"
                  maxLength={200}
                  className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                />
              </label>
            </div>

            <fieldset className="mt-5">
              <legend className="text-sm font-medium text-neutral-800">
                Product interest
              </legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {productInterestOptions.map((product) => (
                  <label
                    key={product}
                    className="flex items-center gap-2 rounded border border-neutral-200 px-3 py-2 text-sm text-neutral-700"
                  >
                    <input
                      type="checkbox"
                      name="product_interest"
                      value={product}
                      className="h-4 w-4 accent-payscribe-blue"
                    />
                    <span>{product}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="mt-5 block">
              <span className="text-sm font-medium text-neutral-800">
                Notes
              </span>
              <textarea
                name="notes"
                rows={3}
                className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
              />
            </label>

            <div className="mt-5 flex justify-end">
              <SubmitButton pendingText="Saving lead...">Save Lead</SubmitButton>
            </div>
              </form>
            </FormModal>
          </div>
        ) : null}

        <div className="mt-6 rounded border border-neutral-200 bg-white p-4">
          <form className="grid gap-3 lg:grid-cols-[1fr_190px_190px_190px_auto]">
            <input
              name="q"
              defaultValue={query}
              placeholder="Search by name, business, phone, email, or ID"
              className="rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
            />
            <select
              name="stage"
              defaultValue={stage}
              className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
            >
              <option value="">All stages</option>
              {leadStages.map((item) => (
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
              {leadStatuses.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              name="source"
              defaultValue={source}
              className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
            >
              <option value="">All sources</option>
              {leadSources.map((item) => (
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
                  <th className="px-4 py-3">Lead</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Assigned</th>
                  <th className="px-4 py-3">Follow-up</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {records.map((lead) => (
                  <tr key={lead.lead_id}>
                    <td className="px-4 py-4">
                      <div className="font-semibold text-neutral-950">
                        <Link
                          href={`/leads/${lead.lead_id}`}
                          className="text-payscribe-blue hover:underline"
                        >
                          {lead.full_name}
                        </Link>
                      </div>
                      <div className="mt-1 text-xs text-neutral-500">
                        {lead.lead_id} - {lead.business_name ?? "No business"}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {lead.stage}
                    </td>
                    <td className="px-4 py-4">
                      <span className="rounded border border-neutral-200 px-2 py-1 text-xs font-semibold text-neutral-700">
                        {lead.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {lead.source}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {staffById.get(lead.assigned_to) ?? "Unknown"}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      <div>{formatDate(lead.next_followup_date)}</div>
                      {isOverdue(lead.next_followup_date) ? (
                        <div className="mt-1 text-xs font-semibold text-red-700">
                          Overdue
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}

                {records.length === 0 ? (
                  <EmptyTableRow colSpan={6} message="No leads found." />
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
