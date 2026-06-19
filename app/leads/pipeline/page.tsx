import { AppShell } from "@/components/app-shell";
import { LeadStageStatusForm } from "@/components/leads/lead-stage-status-form";
import { PageHeader } from "@/components/ui/page-header";
import { StatusAlert } from "@/components/ui/status-alert";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { leadStages } from "@/lib/constants/leads";
import { formatDate } from "@/lib/format/date";
import { hasModulePermission } from "@/lib/permissions/checks";
import type { Lead } from "@/lib/types/leads";
import type { StaffUser } from "@/lib/types/users";
import Link from "next/link";
import { redirect } from "next/navigation";

type LeadPipelinePageProps = {
  searchParams?: {
    error?: string;
    success?: string;
  };
};

export default async function LeadPipelinePage({
  searchParams
}: LeadPipelinePageProps) {
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

  const [{ data: leads }, { data: staffMembers }] = await Promise.all([
    supabase
      .from("leads")
      .select("*")
      .order("updated_at", { ascending: false })
      .returns<Lead[]>(),
    supabase.from("users").select("*").returns<StaffUser[]>()
  ]);

  const records = leads ?? [];
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
          eyebrow="Leads"
          title="Lead Pipeline Board"
          description="Move leads through the sales pipeline and update status from one place."
          actions={
          <Link
            href="/leads"
            className="rounded border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 transition hover:border-payscribe-blue hover:text-payscribe-blue"
          >
            Directory
          </Link>
          }
        />

        <StatusAlert type="error" message={searchParams?.error} />
        <StatusAlert type="success" message={searchParams?.success} />

        <div className="mt-6 grid gap-4 xl:grid-cols-4">
          {leadStages.map((stage) => {
            const stageLeads = records.filter((lead) => lead.stage === stage);

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
                      {stageLeads.length}
                    </span>
                  </div>
                </div>

                <div className="space-y-3 p-3">
                  {stageLeads.map((lead) => (
                    <article
                      key={lead.lead_id}
                      className="rounded border border-neutral-200 p-3"
                    >
                      <Link
                        href={`/leads/${lead.lead_id}`}
                        className="text-sm font-semibold text-payscribe-blue hover:underline"
                      >
                        {lead.full_name}
                      </Link>
                      <p className="mt-1 text-xs text-neutral-500">
                        {lead.lead_id} - {lead.business_name ?? "No business"}
                      </p>
                      <dl className="mt-3 space-y-1 text-xs text-neutral-600">
                        <div className="flex justify-between gap-3">
                          <dt>Status</dt>
                          <dd className="font-medium text-neutral-800">
                            {lead.status}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt>Assigned</dt>
                          <dd className="truncate font-medium text-neutral-800">
                            {staffById.get(lead.assigned_to) ?? "Unknown"}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                          <dt>Follow-up</dt>
                          <dd className="font-medium text-neutral-800">
                            {formatDate(lead.next_followup_date)}
                          </dd>
                        </div>
                      </dl>
                      <div className="mt-3">
                        <LeadStageStatusForm
                          leadId={lead.lead_id}
                          leadName={lead.full_name}
                          currentStage={lead.stage}
                          currentStatus={lead.status}
                          returnTo="/leads/pipeline"
                          canEdit={canEdit}
                        />
                      </div>
                    </article>
                  ))}

                  {stageLeads.length === 0 ? (
                    <p className="rounded border border-dashed border-neutral-200 px-3 py-6 text-center text-xs text-neutral-500">
                      No leads here.
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
