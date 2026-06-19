import { AppShell } from "@/components/app-shell";
import { PartnerTypeField } from "@/components/partners/partner-type-field";
import { StatusAlert } from "@/components/ui/status-alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import {
  partnerCommunicationChannels,
  partnerCommunicationDirections,
  partnerOutreachStatuses,
  partnerPriorities,
  partnerTags
} from "@/lib/constants/partners";
import { formatDate } from "@/lib/format/date";
import { hasModulePermission } from "@/lib/permissions/checks";
import type { Partner, PartnerCommunicationLog } from "@/lib/types/partners";
import type { StaffUser } from "@/lib/types/users";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createPartnerCommunicationLog, updatePartner } from "../actions";

type PartnerDetailPageProps = {
  params: {
    partnerId: string;
  };
  searchParams?: {
    error?: string;
    success?: string;
  };
};

function displayPartnerType(partner: Partner) {
  return partner.partner_type === "Other" && partner.custom_partner_type
    ? partner.custom_partner_type
    : partner.partner_type;
}

export default async function PartnerDetailPage({
  params,
  searchParams
}: PartnerDetailPageProps) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();

  if (!hasModulePermission(currentUser, permissions, "Partners", "can_view")) {
    redirect("/");
  }

  const canEdit = hasModulePermission(
    currentUser,
    permissions,
    "Partners",
    "can_edit"
  );
  const canCreate = hasModulePermission(
    currentUser,
    permissions,
    "Partners",
    "can_create"
  );

  const [{ data: partner }, { data: staffMembers }, { data: logs }] =
    await Promise.all([
      supabase
        .from("partners")
        .select("*")
        .eq("partner_id", params.partnerId)
        .single<Partner>(),
      supabase
        .from("users")
        .select("*")
        .eq("status", "Active")
        .order("full_name", { ascending: true })
        .returns<StaffUser[]>(),
      supabase
        .from("partner_communication_log")
        .select("*")
        .eq("partner_id", params.partnerId)
        .order("date", { ascending: false })
        .returns<PartnerCommunicationLog[]>()
    ]);

  if (!partner) {
    notFound();
  }

  const staffById = new Map(
    (staffMembers ?? []).map((staffMember) => [
      staffMember.user_id,
      staffMember.full_name
    ])
  );
  const disabled = !canEdit;
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
              {partner.partner_id}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-normal text-neutral-950">
              {partner.organisation_name}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
              {displayPartnerType(partner)} - Owned by{" "}
              {partner.payscribe_contact
                ? staffById.get(partner.payscribe_contact) ?? "Unknown"
                : "Unassigned"}
            </p>
          </div>
          <Link
            href="/partners"
            className="rounded border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 transition hover:border-payscribe-blue hover:text-payscribe-blue"
          >
            Back to Partners
          </Link>
        </div>

        <StatusAlert type="error" message={searchParams?.error} />
        <StatusAlert type="success" message={searchParams?.success} />

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <div className="rounded border border-neutral-200 bg-white p-5">
            <p className="text-sm font-medium text-neutral-500">Status</p>
            <p className="mt-2 text-xl font-semibold text-neutral-950">
              {partner.outreach_status}
            </p>
          </div>
          <div className="rounded border border-neutral-200 bg-white p-5">
            <p className="text-sm font-medium text-neutral-500">Priority</p>
            <p className="mt-2 text-xl font-semibold text-neutral-950">
              {partner.priority ?? "Not set"}
            </p>
          </div>
          <div className="rounded border border-neutral-200 bg-white p-5">
            <p className="text-sm font-medium text-neutral-500">Last Contact</p>
            <p className="mt-2 text-xl font-semibold text-neutral-950">
              {formatDate(partner.date_last_interaction)}
            </p>
          </div>
          <div className="rounded border border-neutral-200 bg-white p-5">
            <p className="text-sm font-medium text-neutral-500">Next Review</p>
            <p className="mt-2 text-xl font-semibold text-neutral-950">
              {formatDate(partner.next_review_date)}
            </p>
          </div>
        </div>

        {!canEdit ? (
          <div className="mt-6 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            You can view this record, but you do not have edit permission for
            Partners.
          </div>
        ) : null}

        <form
          action={updatePartner}
          className="mt-6 rounded border border-neutral-200 bg-white p-5"
        >
          <input type="hidden" name="partner_id" value={partner.partner_id} />
          <h3 className="text-base font-semibold text-neutral-950">
            Partner Details
          </h3>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Organisation name
              </span>
              <input
                required
                disabled={disabled}
                name="organisation_name"
                defaultValue={partner.organisation_name}
                className={inputClass}
              />
            </label>

            <div className="md:col-span-2">
              <PartnerTypeField
                disabled={disabled}
                defaultType={partner.partner_type}
                defaultCustomType={partner.custom_partner_type}
              />
            </div>

            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Owner
              </span>
              <select
                disabled={disabled}
                name="payscribe_contact"
                defaultValue={partner.payscribe_contact ?? ""}
                className={selectClass}
              >
                <option value="">Unassigned</option>
                {(staffMembers ?? []).map((staffMember) => (
                  <option key={staffMember.user_id} value={staffMember.user_id}>
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
                disabled={disabled}
                name="outreach_status"
                defaultValue={partner.outreach_status}
                className={selectClass}
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
                disabled={disabled}
                name="priority"
                defaultValue={partner.priority ?? ""}
                className={selectClass}
              >
                <option value="">No priority</option>
                {partnerPriorities.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            {(
              [
                ["website", "Website", partner.website],
                ["country", "Country", partner.country],
                ["their_contact_name", "Contact name", partner.their_contact_name],
                ["their_contact_title", "Contact title", partner.their_contact_title],
                ["their_contact_email", "Contact email", partner.their_contact_email],
                ["their_contact_phone", "Contact phone", partner.their_contact_phone]
              ] satisfies Array<[string, string, string | null]>
            ).map(([name, label, value]) => (
              <label key={name} className="block">
                <span className="text-sm font-medium text-neutral-800">
                  {label}
                </span>
                <input
                  disabled={disabled}
                  name={name}
                  defaultValue={value ?? ""}
                  className={inputClass}
                />
              </label>
            ))}

            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Next review date
              </span>
              <input
                disabled={disabled}
                name="next_review_date"
                type="date"
                defaultValue={partner.next_review_date ?? ""}
                className={inputClass}
              />
            </label>
          </div>

          <label className="mt-5 flex items-center gap-2 text-sm text-neutral-700">
            <input
              disabled={disabled}
              type="checkbox"
              name="would_revisit"
              defaultChecked={partner.would_revisit}
              className="h-4 w-4 accent-payscribe-blue"
            />
            <span>Would revisit this relationship later</span>
          </label>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Service description
              </span>
              <textarea
                disabled={disabled}
                name="service_description"
                rows={3}
                defaultValue={partner.service_description ?? ""}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Reason for outreach
              </span>
              <textarea
                disabled={disabled}
                name="reason_for_outreach"
                rows={3}
                defaultValue={partner.reason_for_outreach ?? ""}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Outcome reason
              </span>
              <textarea
                disabled={disabled}
                name="outcome_reason"
                rows={3}
                defaultValue={partner.outcome_reason ?? ""}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Notes
              </span>
              <textarea
                disabled={disabled}
                name="notes"
                rows={3}
                defaultValue={partner.notes ?? ""}
                className={inputClass}
              />
            </label>
          </div>

          <fieldset className="mt-5" disabled={disabled}>
            <legend className="text-sm font-medium text-neutral-800">Tags</legend>
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
                    defaultChecked={(partner.tags ?? []).includes(tag)}
                    className="h-4 w-4 accent-payscribe-blue"
                  />
                  <span>{tag}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {canEdit ? (
            <div className="mt-5 flex justify-end">
              <SubmitButton pendingText="Saving partner...">
                Save Partner
              </SubmitButton>
            </div>
          ) : null}
        </form>

        {canCreate ? (
          <form
            action={createPartnerCommunicationLog}
            className="mt-6 rounded border border-neutral-200 bg-white p-5"
          >
            <input type="hidden" name="partner_id" value={partner.partner_id} />
            <h3 className="text-base font-semibold text-neutral-950">
              Log Communication
            </h3>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="block">
                <span className="text-sm font-medium text-neutral-800">
                  Date and time
                </span>
                <input required name="date" type="datetime-local" className={inputClass} />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-neutral-800">
                  Channel
                </span>
                <select required name="channel" className={selectClass}>
                  {partnerCommunicationChannels.map((channel) => (
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
                <select required name="direction" className={selectClass}>
                  {partnerCommunicationDirections.map((direction) => (
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
                <input name="follow_up_date" type="date" className={inputClass} />
              </label>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-neutral-800">
                  Payscribe participants
                </span>
                <input name="participants_payscribe" className={inputClass} />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-neutral-800">
                  Partner participants
                </span>
                <input name="participants_partner" className={inputClass} />
              </label>
            </div>

            <label className="mt-5 block">
              <span className="text-sm font-medium text-neutral-800">
                Summary
              </span>
              <textarea required name="summary" rows={3} className={inputClass} />
            </label>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-neutral-800">
                  Outcome
                </span>
                <input name="outcome" className={inputClass} />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-neutral-800">
                  Next step
                </span>
                <input name="next_step" className={inputClass} />
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
                {(logs ?? []).map((log) => (
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

                {(logs ?? []).length === 0 ? (
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
      </section>
    </AppShell>
  );
}
