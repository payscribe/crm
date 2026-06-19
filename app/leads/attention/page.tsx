import { AppShell } from "@/components/app-shell";
import { EmptyTableRow } from "@/components/ui/empty-table-row";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { formatDate } from "@/lib/format/date";
import { hasModulePermission } from "@/lib/permissions/checks";
import type { Lead } from "@/lib/types/leads";
import type { StaffUser } from "@/lib/types/users";
import Link from "next/link";
import { redirect } from "next/navigation";

function isDueOrOverdue(date: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(date).getTime() <= today.getTime();
}

function hoursSince(value: string) {
  return Math.floor((Date.now() - new Date(value).getTime()) / 3600000);
}

export default async function LeadAttentionPage() {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();

  if (!hasModulePermission(currentUser, permissions, "Leads", "can_view")) {
    redirect("/");
  }

  const [{ data: leads }, { data: staffMembers }] = await Promise.all([
    supabase
      .from("leads")
      .select("*")
      .order("next_followup_date", { ascending: true })
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
  const dueLeads = records.filter(
    (lead) =>
      !["Closed Won", "Closed Lost"].includes(lead.status) &&
      isDueOrOverdue(lead.next_followup_date)
  );
  const newNoContact48Hours = records.filter(
    (lead) =>
      lead.stage === "New" &&
      !lead.last_contact_date &&
      hoursSince(lead.created_at) >= 48
  );

  return (
    <AppShell currentUser={currentUser} permissions={permissions}>
      <section>
        <PageHeader
          eyebrow="Leads"
          title="Lead Attention Center"
          description="Leads that need contact, follow-up, or stage movement today."
          actions={
          <Link
            href="/leads"
            className="rounded border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 transition hover:border-payscribe-blue hover:text-payscribe-blue"
          >
            Directory
          </Link>
          }
        />

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <MetricCard
            label="Due or Overdue Follow-ups"
            value={dueLeads.length}
          />
          <MetricCard
            label="New Stage 48h No Contact"
            value={newNoContact48Hours.length}
          />
        </div>

        <div className="mt-6 overflow-hidden rounded border border-neutral-200 bg-white">
          <div className="border-b border-neutral-200 px-4 py-3">
            <h3 className="text-base font-semibold text-neutral-950">
              Follow-ups Due
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Lead</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Assigned</th>
                  <th className="px-4 py-3">Follow-up</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {dueLeads.map((lead) => (
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
                      {lead.status}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {staffById.get(lead.assigned_to) ?? "Unknown"}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {formatDate(lead.next_followup_date)}
                    </td>
                  </tr>
                ))}

                {dueLeads.length === 0 ? (
                  <EmptyTableRow colSpan={4} message="No follow-ups are due." />
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded border border-neutral-200 bg-white">
          <div className="border-b border-neutral-200 px-4 py-3">
            <h3 className="text-base font-semibold text-neutral-950">
              New Leads With No Contact After 48 Hours
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Lead</th>
                  <th className="px-4 py-3">Assigned</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {newNoContact48Hours.map((lead) => (
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
                      {staffById.get(lead.assigned_to) ?? "Unknown"}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {formatDate(lead.created_at)}
                    </td>
                  </tr>
                ))}

                {newNoContact48Hours.length === 0 ? (
                  <EmptyTableRow
                    colSpan={3}
                    message="No new leads are stuck without contact."
                  />
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
