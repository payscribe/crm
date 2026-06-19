import { AppShell } from "@/components/app-shell";
import { EmptyTableRow } from "@/components/ui/empty-table-row";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import {
  daysBetweenToday,
  getBusinessAttentionLists
} from "@/lib/businesses/attention";
import { defaultAutomationSettings } from "@/lib/constants/automation-settings";
import { formatNaira } from "@/lib/format/currency";
import { formatDate } from "@/lib/format/date";
import { hasModulePermission } from "@/lib/permissions/checks";
import type { AutomationSettings } from "@/lib/types/automation-settings";
import type { Business } from "@/lib/types/businesses";
import type { StaffUser } from "@/lib/types/users";
import Link from "next/link";
import { redirect } from "next/navigation";

type AttentionTableProps = {
  title: string;
  description: string;
  businesses: Business[];
  staffById: Map<string, string>;
  dateField: "registration_date" | "kyb_approval_date" | "last_transaction_date";
};

function AttentionTable({
  title,
  description,
  businesses,
  staffById,
  dateField
}: AttentionTableProps) {
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
            {businesses.length}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">CS Owner</th>
              <th className="px-4 py-3">Trigger Date</th>
              <th className="px-4 py-3">Age</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {businesses.map((business) => (
              <tr key={business.business_id}>
                <td className="px-4 py-4">
                  <Link
                    href={`/businesses/${business.business_id}`}
                    className="font-semibold text-payscribe-blue hover:underline"
                  >
                    {business.business_name}
                  </Link>
                  <div className="mt-1 text-xs text-neutral-500">
                    {business.business_id}
                  </div>
                </td>
                <td className="px-4 py-4 text-neutral-700">
                  {business.owner_name ?? "Not set"}
                </td>
                <td className="px-4 py-4 text-neutral-700">
                  {business.assigned_cs_owner
                    ? staffById.get(business.assigned_cs_owner) ?? "Unknown"
                    : "Unassigned"}
                </td>
                <td className="px-4 py-4 text-neutral-700">
                  {formatDate(business[dateField])}
                </td>
                <td className="px-4 py-4 text-neutral-700">
                  {daysBetweenToday(business[dateField]) ?? "Not available"} days
                </td>
              </tr>
            ))}

            {businesses.length === 0 ? (
              <EmptyTableRow
                colSpan={5}
                message="Nothing needs attention here."
              />
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function BusinessAttentionPage() {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();

  if (
    !hasModulePermission(currentUser, permissions, "Businesses", "can_view")
  ) {
    redirect("/");
  }

  const [
    { data: businesses },
    { data: staffMembers },
    { data: automationSettings }
  ] = await Promise.all([
    supabase
      .from("businesses")
      .select("*")
      .order("updated_at", { ascending: false })
      .returns<Business[]>(),
    supabase
      .from("users")
      .select("*")
      .eq("status", "Active")
      .returns<StaffUser[]>(),
    supabase
      .from("automation_settings")
      .select("*")
      .eq("settings_id", true)
      .maybeSingle<AutomationSettings>()
  ]);

  const records = businesses ?? [];
  const staffById = new Map(
    (staffMembers ?? []).map((staffMember) => [
      staffMember.user_id,
      staffMember.full_name
    ])
  );
  const settings = automationSettings ?? defaultAutomationSettings;
  const attention = getBusinessAttentionLists(records, settings);

  const totalAttention =
    attention.kybNotSubmitted48Hours.length +
    attention.noFirstTransaction7Days.length +
    attention.inactive30Days.length +
    attention.atRiskBusinesses.length +
    attention.needsReassignment.length +
    attention.approachingTransactionLimit.length;

  return (
    <AppShell currentUser={currentUser} permissions={permissions}>
      <section>
        <PageHeader
          eyebrow="Businesses"
          title="Attention Center"
          description="Live list of business records that match the lifecycle automation rules and need follow-up."
          actions={
            <>
            <Link
              href="/businesses"
              className="rounded border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 transition hover:border-payscribe-blue hover:text-payscribe-blue"
            >
              Directory
            </Link>
            <Link
              href="/businesses/pipeline"
              className="rounded bg-payscribe-blue px-4 py-2 text-sm font-semibold text-white"
            >
              Pipeline
            </Link>
            </>
          }
        />

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <MetricCard label="Total Attention Items" value={totalAttention} />
          <MetricCard
            label="At Risk Businesses"
            value={attention.atRiskBusinesses.length}
          />
          <MetricCard
            label="Reassignment Needed"
            value={attention.needsReassignment.length}
          />
        </div>

        <div className="mt-6 space-y-6">
          <AttentionTable
            title={`KYB Not Submitted After ${settings.kyb_not_submitted_days} Days`}
            description="Registered businesses where KYB is still Not Submitted after the configured threshold."
            businesses={attention.kybNotSubmitted48Hours}
            staffById={staffById}
            dateField="registration_date"
          />

          <AttentionTable
            title={`No First Transaction ${settings.no_first_transaction_first_alert_days}+ Days After KYB Approval`}
            description="KYB-approved businesses that have not completed a first transaction after the configured first alert threshold."
            businesses={attention.noFirstTransaction7Days}
            staffById={staffById}
            dateField="kyb_approval_date"
          />

          <AttentionTable
            title={`No First Transaction ${settings.no_first_transaction_at_risk_days}+ Days After KYB Approval`}
            description="Businesses that should be reviewed for At Risk movement if they still have no first transaction."
            businesses={attention.noFirstTransaction21Days}
            staffById={staffById}
            dateField="kyb_approval_date"
          />

          <AttentionTable
            title={`Active Businesses Inactive for ${settings.inactive_first_alert_days}+ Days`}
            description="Active businesses whose last transaction is older than the configured first inactive threshold."
            businesses={attention.inactive30Days}
            staffById={staffById}
            dateField="last_transaction_date"
          />

          <section className="rounded border border-neutral-200 bg-white">
            <div className="border-b border-neutral-200 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-950">
                    Approaching Transaction Limit
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-neutral-600">
                    Businesses at or above{" "}
                    {settings.transaction_limit_warning_percent} percent of
                    their configured transaction limit.
                  </p>
                </div>
                <span className="rounded bg-neutral-100 px-2 py-1 text-xs font-semibold text-neutral-700">
                  {attention.approachingTransactionLimit.length}
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-neutral-200 text-sm">
                <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="px-4 py-3">Business</th>
                    <th className="px-4 py-3">Current Volume</th>
                    <th className="px-4 py-3">Limit</th>
                    <th className="px-4 py-3">Indemnity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {attention.approachingTransactionLimit.map((business) => (
                    <tr key={business.business_id}>
                      <td className="px-4 py-4">
                        <Link
                          href={`/businesses/${business.business_id}`}
                          className="font-semibold text-payscribe-blue hover:underline"
                        >
                          {business.business_name}
                        </Link>
                        <div className="mt-1 text-xs text-neutral-500">
                          {business.business_id}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-neutral-700">
                        {formatNaira(business.current_transaction_volume)}
                      </td>
                      <td className="px-4 py-4 text-neutral-700">
                        {formatNaira(business.transaction_limit_amount)}
                      </td>
                      <td className="px-4 py-4 text-neutral-700">
                        {business.indemnity_form_on_file ? "On file" : "Missing"}
                      </td>
                    </tr>
                  ))}

                  {attention.approachingTransactionLimit.length === 0 ? (
                    <EmptyTableRow
                      colSpan={4}
                      message="No businesses are near their transaction limit."
                    />
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </section>
    </AppShell>
  );
}
