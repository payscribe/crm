import { AppShell } from "@/components/app-shell";
import { LeadDangerActions } from "@/components/leads/lead-danger-actions";
import { LeadStageStatusForm } from "@/components/leads/lead-stage-status-form";
import { StatusAlert } from "@/components/ui/status-alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import {
  leadCommunicationChannels,
  leadCommunicationDirections,
  leadSources,
  leadStages,
  leadStatuses
} from "@/lib/constants/leads";
import { formatDate } from "@/lib/format/date";
import { hasModulePermission } from "@/lib/permissions/checks";
import { getHistoricalAwareLeadProductOptions } from "@/lib/settings/managed-options";
import type { Business } from "@/lib/types/businesses";
import type { Lead, LeadCommunicationLog } from "@/lib/types/leads";
import type { StaffUser } from "@/lib/types/users";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createLeadCommunicationLog, updateLead } from "../actions";

type LeadDetailPageProps = {
  params: {
    leadId: string;
  };
  searchParams?: {
    error?: string;
    success?: string;
  };
};

export default async function LeadDetailPage({
  params,
  searchParams
}: LeadDetailPageProps) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();

  if (!hasModulePermission(currentUser, permissions, "Leads", "can_view")) {
    redirect("/");
  }

  const canEdit = hasModulePermission(
    currentUser,
    permissions,
    "Leads",
    "can_edit"
  );
  const canCreate = hasModulePermission(
    currentUser,
    permissions,
    "Leads",
    "can_create"
  );
  const canDelete = hasModulePermission(
    currentUser,
    permissions,
    "Leads",
    "can_delete"
  );
  const canViewBusiness = hasModulePermission(
    currentUser,
    permissions,
    "Businesses",
    "can_view"
  );

  const [
    { data: lead },
    { data: staffMembers },
    { data: communicationLogs },
    { data: businesses },
    productInterestOptionState
  ] =
    await Promise.all([
      supabase
        .from("leads")
        .select("*")
        .eq("lead_id", params.leadId)
        .single<Lead>(),
      supabase
        .from("users")
        .select("*")
        .eq("status", "Active")
        .order("full_name", { ascending: true })
        .returns<StaffUser[]>(),
      supabase
        .from("lead_communication_log")
        .select("*")
        .eq("lead_id", params.leadId)
        .order("date", { ascending: false })
        .returns<LeadCommunicationLog[]>(),
      canViewBusiness
        ? supabase
            .from("businesses")
            .select("*")
            .order("business_name", { ascending: true })
            .returns<Business[]>()
        : Promise.resolve({ data: [] as Business[] }),
      supabase
        .from("leads")
        .select("product_interest")
        .eq("lead_id", params.leadId)
        .single<{ product_interest: string[] }>()
        .then(({ data }) =>
          getHistoricalAwareLeadProductOptions(
            supabase,
            data?.product_interest ?? []
          )
        )
    ]);

  if (!lead) {
    notFound();
  }

  const staffById = new Map(
    (staffMembers ?? []).map((staffMember) => [
      staffMember.user_id,
      staffMember.full_name
    ])
  );
  const disabled = !canEdit;
  const linkedBusiness = (businesses ?? []).find(
    (business) => business.business_id === lead.linked_business_id
  );
  const inputClass =
    "mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20 disabled:bg-neutral-100 disabled:text-neutral-500";
  const selectClass =
    "mt-2 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20 disabled:bg-neutral-100 disabled:text-neutral-500";

  return (
    <AppShell currentUser={currentUser} permissions={permissions}>
      <section>
        <div className="flex flex-col gap-4 border-b border-neutral-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-payscribe-blue">
              {lead.lead_id}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-normal text-neutral-950">
              {lead.full_name}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
              {lead.business_name ?? "No business name"} · Assigned to{" "}
              {staffById.get(lead.assigned_to) ?? "Unknown"}
            </p>
          </div>
          <Link
            href="/leads"
            className="rounded border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 transition hover:border-payscribe-blue hover:text-payscribe-blue"
          >
            Back to Leads
          </Link>
        </div>

        <StatusAlert type="error" message={searchParams?.error} />
        <StatusAlert type="success" message={searchParams?.success} />

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded border border-neutral-200 bg-white p-5">
            <p className="text-sm font-medium text-neutral-500">Stage</p>
            <p className="mt-2 text-xl font-semibold text-neutral-950">
              {lead.stage}
            </p>
          </div>
          <div className="rounded border border-neutral-200 bg-white p-5">
            <p className="text-sm font-medium text-neutral-500">Status</p>
            <p className="mt-2 text-xl font-semibold text-neutral-950">
              {lead.status}
            </p>
          </div>
          <div className="rounded border border-neutral-200 bg-white p-5">
            <p className="text-sm font-medium text-neutral-500">
              Next follow-up
            </p>
            <p className="mt-2 text-xl font-semibold text-neutral-950">
              {formatDate(lead.next_followup_date)}
            </p>
          </div>
        </div>

        {lead.linked_business_id ? (
          <div className="mt-6 rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            Linked business:{" "}
            <Link
              href={`/businesses/${lead.linked_business_id}`}
              className="font-semibold underline"
            >
              {linkedBusiness?.business_name ?? lead.linked_business_id}
            </Link>
          </div>
        ) : null}

        {!canEdit ? (
          <div className="mt-6 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            You can view this record, but you do not have edit permission for
            Leads.
          </div>
        ) : null}

        <div className="mt-6 rounded border border-neutral-200 bg-white p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-base font-semibold text-neutral-950">
                Quick Pipeline Move
              </h3>
              <p className="mt-1 text-sm text-neutral-600">
                Update stage and status without changing the rest of the lead.
              </p>
            </div>
            <div className="w-full md:max-w-xl">
              <LeadStageStatusForm
                leadId={lead.lead_id}
                leadName={lead.full_name}
                currentStage={lead.stage}
                currentStatus={lead.status}
                returnTo={`/leads/${lead.lead_id}`}
                canEdit={canEdit}
              />
            </div>
          </div>
        </div>

        <form
          action={updateLead}
          className="mt-6 rounded border border-neutral-200 bg-white p-5"
        >
          <input type="hidden" name="lead_id" value={lead.lead_id} />
          <div>
            <h3 className="text-base font-semibold text-neutral-950">
              Lead Details
            </h3>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Full name
              </span>
              <input
                required
                disabled={disabled}
                name="full_name"
                defaultValue={lead.full_name}
                className={inputClass}
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Business name
              </span>
              <input
                disabled={disabled}
                name="business_name"
                defaultValue={lead.business_name ?? ""}
                className={inputClass}
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Phone
              </span>
              <input
                required
                disabled={disabled}
                name="phone"
                defaultValue={lead.phone}
                className={inputClass}
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Email
              </span>
              <input
                disabled={disabled}
                name="email"
                type="email"
                defaultValue={lead.email ?? ""}
                className={inputClass}
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Source
              </span>
              <select
                required
                disabled={disabled}
                name="source"
                defaultValue={lead.source}
                className={selectClass}
              >
                {leadSources.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Referral source name
              </span>
              <input
                disabled={disabled}
                name="referral_source_name"
                defaultValue={lead.referral_source_name ?? ""}
                className={inputClass}
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Stage
              </span>
              <select
                disabled={disabled}
                name="stage"
                defaultValue={lead.stage}
                className={selectClass}
              >
                {leadStages.map((stage) => (
                  <option key={stage} value={stage}>
                    {stage}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Status
              </span>
              <select
                disabled={disabled}
                name="status"
                defaultValue={lead.status}
                className={selectClass}
              >
                {leadStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
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
                disabled={disabled}
                name="assigned_to"
                defaultValue={lead.assigned_to}
                className={selectClass}
              >
                {(staffMembers ?? []).map((staffMember) => (
                  <option key={staffMember.user_id} value={staffMember.user_id}>
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
                disabled={disabled}
                name="next_followup_date"
                type="date"
                defaultValue={lead.next_followup_date}
                className={inputClass}
              />
            </label>

            <label className="block xl:col-span-2">
              <span className="text-sm font-medium text-neutral-800">
                Last message summary
              </span>
              <input
                disabled={disabled}
                name="last_message_summary"
                maxLength={200}
                defaultValue={lead.last_message_summary ?? ""}
                className={inputClass}
              />
            </label>
          </div>

          <fieldset className="mt-5" disabled={disabled}>
            <legend className="text-sm font-medium text-neutral-800">
              Product interest
            </legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {productInterestOptionState.labels.map((product) => {
                const isInactive =
                  lead.product_interest.includes(product) &&
                  !productInterestOptionState.activeLabels.includes(product);

                return (
                <label
                  key={product}
                  className="flex items-center gap-2 rounded border border-neutral-200 px-3 py-2 text-sm text-neutral-700"
                >
                  <input
                    type="checkbox"
                    name="product_interest"
                    value={product}
                    defaultChecked={lead.product_interest.includes(product)}
                    className="h-4 w-4 accent-payscribe-blue"
                  />
                  <span>
                    {product}
                    {isInactive ? (
                      <span className="ml-2 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">
                        Inactive
                      </span>
                    ) : null}
                  </span>
                </label>
                );
              })}
            </div>
          </fieldset>

          <label className="mt-5 block">
            <span className="text-sm font-medium text-neutral-800">Notes</span>
            <textarea
              disabled={disabled}
              name="notes"
              rows={4}
              defaultValue={lead.notes ?? ""}
              className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20 disabled:bg-neutral-100 disabled:text-neutral-500"
            />
          </label>

          {canEdit ? (
            <div className="mt-5 flex justify-end">
              <SubmitButton pendingText="Saving lead...">Save Lead</SubmitButton>
            </div>
          ) : null}
        </form>

        {canCreate ? (
          <form
            action={createLeadCommunicationLog}
            className="mt-6 rounded border border-neutral-200 bg-white p-5"
          >
            <input type="hidden" name="lead_id" value={lead.lead_id} />
            <div>
              <h3 className="text-base font-semibold text-neutral-950">
                Log Communication
              </h3>
              <p className="mt-1 text-sm text-neutral-600">
                Adding a log updates last contact date and follow-up date.
              </p>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="block">
                <span className="text-sm font-medium text-neutral-800">
                  Date and time
                </span>
                <input
                  required
                  name="date"
                  type="datetime-local"
                  className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-neutral-800">
                  Channel
                </span>
                <select
                  required
                  name="channel"
                  className="mt-2 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                >
                  {leadCommunicationChannels.map((channel) => (
                    <option key={channel} value={channel}>
                      {channel}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-neutral-800">
                  Direction
                </span>
                <select
                  required
                  name="direction"
                  className="mt-2 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                >
                  {leadCommunicationDirections.map((direction) => (
                    <option key={direction} value={direction}>
                      {direction}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-neutral-800">
                  Follow-up date
                </span>
                <input
                  name="follow_up_date"
                  type="date"
                  className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                />
              </label>
            </div>

            <label className="mt-5 block">
              <span className="text-sm font-medium text-neutral-800">
                Summary
              </span>
              <textarea
                required
                name="summary"
                rows={3}
                className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
              />
            </label>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-neutral-800">
                  Action taken
                </span>
                <input
                  name="action_taken"
                  className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-neutral-800">
                  Next step
                </span>
                <input
                  name="next_step"
                  className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end">
              <SubmitButton pendingText="Saving communication...">
                Save Communication
              </SubmitButton>
            </div>
          </form>
        ) : null}

        <div className="mt-6 overflow-hidden rounded border border-neutral-200 bg-white">
          <div className="border-b border-neutral-200 px-4 py-3">
            <h3 className="text-base font-semibold text-neutral-950">
              Communication Log
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Channel</th>
                  <th className="px-4 py-3">Direction</th>
                  <th className="px-4 py-3">Summary</th>
                  <th className="px-4 py-3">Logged By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {(communicationLogs ?? []).map((log) => (
                  <tr key={log.log_id}>
                    <td className="px-4 py-4 text-neutral-700">
                      {formatDate(log.date)}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {log.channel}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {log.direction}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {log.summary}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {staffById.get(log.logged_by) ?? "Unknown"}
                    </td>
                  </tr>
                ))}

                {(communicationLogs ?? []).length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-sm text-neutral-500"
                    >
                      No communication has been logged yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 rounded border border-neutral-200 bg-white p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-base font-semibold text-neutral-950">
                Lead Actions
              </h3>
              <p className="mt-1 text-sm text-neutral-600">
                Link qualified leads to registered businesses or remove records
                created in error.
              </p>
            </div>
            <LeadDangerActions
              businesses={businesses ?? []}
              linkedBusinessId={lead.linked_business_id}
              leadId={lead.lead_id}
              leadName={lead.full_name}
              canDelete={canDelete}
              canLinkBusiness={canEdit && canViewBusiness && !lead.linked_business_id}
            />
          </div>
        </div>
      </section>
    </AppShell>
  );
}
