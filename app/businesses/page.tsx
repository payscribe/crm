import { AppShell } from "@/components/app-shell";
import { EmptyTableRow } from "@/components/ui/empty-table-row";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusAlert } from "@/components/ui/status-alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import {
  businessLifecycleStages,
  kybStatuses,
} from "@/lib/constants/businesses";
import { formatNaira } from "@/lib/format/currency";
import { formatDate } from "@/lib/format/date";
import { hasModulePermission } from "@/lib/permissions/checks";
import type { Business, BusinessLifecycleStage } from "@/lib/types/businesses";
import type { StaffUser } from "@/lib/types/users";
import Link from "next/link";
import { redirect } from "next/navigation";

type BusinessesPageProps = {
  searchParams?: {
    q?: string;
    stage?: string;
    kyb?: string;
    error?: string;
    success?: string;
  };
};

function daysSince(value: string | null) {
  if (!value) {
    return "No transaction";
  }

  const oneDay = 1000 * 60 * 60 * 24;
  const diff = Date.now() - new Date(value).getTime();
  const days = Math.max(0, Math.floor(diff / oneDay));
  return `${days} day${days === 1 ? "" : "s"}`;
}

export default async function BusinessesPage({
  searchParams
}: BusinessesPageProps) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();

  if (
    !hasModulePermission(currentUser, permissions, "Businesses", "can_view")
  ) {
    redirect("/");
  }

  const query = searchParams?.q?.trim() ?? "";
  const stage = searchParams?.stage ?? "";
  const kyb = searchParams?.kyb ?? "";

  let businessesQuery = supabase
    .from("businesses")
    .select("*");

  if (query) {
    businessesQuery = businessesQuery.or(
      `business_name.ilike.%${query}%,owner_name.ilike.%${query}%,email.ilike.%${query}%,business_id.ilike.%${query}%`
    );
  }

  if (businessLifecycleStages.includes(stage as BusinessLifecycleStage)) {
    businessesQuery = businessesQuery.eq("lifecycle_stage", stage);
  }

  if (kybStatuses.includes(kyb as never)) {
    businessesQuery = businessesQuery.eq("kyb_status", kyb);
  }

  const [{ data: businesses }, { data: staffMembers }] = await Promise.all([
    businessesQuery
      .order("created_at", { ascending: false })
      .returns<Business[]>(),
    supabase
      .from("users")
      .select("*")
      .eq("status", "Active")
      .order("full_name", { ascending: true })
      .returns<StaffUser[]>()
  ]);

  const records = businesses ?? [];
  const staffById = new Map(
    (staffMembers ?? []).map((staffMember) => [
      staffMember.user_id,
      staffMember.full_name
    ])
  );

  const stageCounts = businessLifecycleStages.map((stageName) => ({
    stage: stageName,
    count: records.filter((business) => business.lifecycle_stage === stageName)
      .length
  }));

  const atRiskBusinesses = records.filter(
    (business) => business.lifecycle_stage === "At Risk"
  );

  const inactive30Days = records.filter((business) => {
    if (!business.last_transaction_date) {
      return false;
    }

    const diff = Date.now() - new Date(business.last_transaction_date).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24)) >= 30;
  });

  return (
    <AppShell currentUser={currentUser} permissions={permissions}>
      <section>
        <PageHeader
          eyebrow="Businesses"
          title="Business Lifecycle"
          description="Track registered businesses from KYB through activation, risk, and churn."
          actions={
            <>
            <Link
              href="/businesses/attention"
              className="rounded border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 transition hover:border-payscribe-blue hover:text-payscribe-blue"
            >
              Attention Center
            </Link>
            <Link
              href="/businesses/pipeline"
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
          {stageCounts.map((item) => (
            <MetricCard
              key={item.stage}
              label={item.stage}
              value={item.count}
              density="compact"
            />
          ))}
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <MetricCard
            label="At Risk Businesses"
            value={atRiskBusinesses.length}
          />
          <MetricCard
            label="No Transaction for 30+ Days"
            value={inactive30Days.length}
          />
        </div>

        <div className="mt-6 rounded border border-neutral-200 bg-white p-4">
          <form className="grid gap-3 lg:grid-cols-[1fr_220px_220px_auto]">
            <input
              name="q"
              defaultValue={query}
              placeholder="Search by name, owner, email, or ID"
              className="rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
            />
            <select
              name="stage"
              defaultValue={stage}
              className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
            >
              <option value="">All lifecycle stages</option>
              {businessLifecycleStages.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              name="kyb"
              defaultValue={kyb}
              className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
            >
              <option value="">All KYB statuses</option>
              {kybStatuses.map((item) => (
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
                  <th className="px-4 py-3">Business</th>
                  <th className="px-4 py-3">Lifecycle</th>
                  <th className="px-4 py-3">KYB</th>
                  <th className="px-4 py-3">CS Owner</th>
                  <th className="px-4 py-3">Last Transaction</th>
                  <th className="px-4 py-3">Volume</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {records.map((business) => (
                  <tr key={business.business_id}>
                    <td className="px-4 py-4">
                      <div className="font-semibold text-neutral-950">
                        <Link
                          href={`/businesses/${business.business_id}`}
                          className="text-payscribe-blue hover:underline"
                        >
                          {business.business_name}
                        </Link>
                      </div>
                      <div className="mt-1 text-xs text-neutral-500">
                        {business.business_id} - {business.email}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="rounded border border-neutral-200 px-2 py-1 text-xs font-semibold text-neutral-700">
                        {business.lifecycle_stage}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {business.kyb_status}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {business.assigned_cs_owner
                        ? staffById.get(business.assigned_cs_owner) ?? "Unknown"
                        : "Unassigned"}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      <div>{formatDate(business.last_transaction_date)}</div>
                      <div className="mt-1 text-xs text-neutral-500">
                        {daysSince(business.last_transaction_date)}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      <div>
                        {formatNaira(business.current_transaction_volume)}
                      </div>
                      <div className="mt-1 text-xs text-neutral-500">
                        Limit: {formatNaira(business.transaction_limit_amount)}
                      </div>
                    </td>
                  </tr>
                ))}

                {records.length === 0 ? (
                  <EmptyTableRow colSpan={6} message="No businesses found." />
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
