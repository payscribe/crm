import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { businessLifecycleStages } from "@/lib/constants/businesses";
import { formatDate } from "@/lib/format/date";
import { hasModulePermission } from "@/lib/permissions/checks";
import type { Business } from "@/lib/types/businesses";
import type { StaffUser } from "@/lib/types/users";
import Link from "next/link";
import { redirect } from "next/navigation";

type PipelinePageProps = {
};

export default async function BusinessPipelinePage({}: PipelinePageProps) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();

  if (
    !hasModulePermission(currentUser, permissions, "Businesses", "can_view")
  ) {
    redirect("/");
  }

  const [{ data: businesses }, { data: staffMembers }] = await Promise.all([
    supabase
      .from("businesses")
      .select("*")
      .order("updated_at", { ascending: false })
      .returns<Business[]>(),
    supabase
      .from("users")
      .select("*")
      .eq("status", "Active")
      .returns<StaffUser[]>()
  ]);

  const records = businesses ?? [];
  const staffById = new Map(
    (staffMembers ?? []).map((staffMember) => [
      staffMember.user_id,
      staffMember.full_name
    ])
  );

  return (
    <AppShell currentUser={currentUser} permissions={permissions}>
      <section>
        <PageHeader
          eyebrow="Businesses"
          title="Lifecycle Pipeline"
          description="Read-only view of businesses by platform lifecycle stage."
          actions={
          <Link
            href="/businesses"
            className="rounded border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 transition hover:border-payscribe-blue hover:text-payscribe-blue"
          >
            Directory
          </Link>
          }
        />

        <div className="mt-6 grid gap-4 xl:grid-cols-4">
          {businessLifecycleStages.map((stage) => {
            const stageBusinesses = records.filter(
              (business) => business.lifecycle_stage === stage
            );

            return (
              <div
                key={stage}
                className="min-h-48 rounded border border-neutral-200 bg-white"
              >
                <div className="border-b border-neutral-200 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-neutral-950">
                      {stage}
                    </h3>
                    <span className="rounded bg-neutral-100 px-2 py-1 text-xs font-semibold text-neutral-700">
                      {stageBusinesses.length}
                    </span>
                  </div>
                </div>

                <div className="space-y-3 p-3">
                  {stageBusinesses.map((business) => (
                    <article
                      key={business.business_id}
                      className="rounded border border-neutral-200 p-3"
                    >
                      <Link
                        href={`/businesses/${business.business_id}`}
                        className="text-sm font-semibold text-payscribe-blue hover:underline"
                      >
                        {business.business_name}
                      </Link>
                      <p className="mt-1 text-xs text-neutral-500">
                        {business.business_id}
                      </p>
                      <dl className="mt-3 space-y-1 text-xs text-neutral-600">
                        <div className="flex justify-between gap-3">
                          <dt>KYB</dt>
                          <dd className="font-medium text-neutral-800">
                            {business.kyb_status}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt>CS owner</dt>
                          <dd className="truncate font-medium text-neutral-800">
                            {business.assigned_cs_owner
                              ? staffById.get(business.assigned_cs_owner) ??
                                "Unknown"
                              : "Unassigned"}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt>Last txn</dt>
                          <dd className="font-medium text-neutral-800">
                            {formatDate(business.last_transaction_date)}
                          </dd>
                        </div>
                      </dl>
                    </article>
                  ))}

                  {stageBusinesses.length === 0 ? (
                    <p className="rounded border border-dashed border-neutral-200 px-3 py-6 text-center text-xs text-neutral-500">
                      No businesses here.
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}
