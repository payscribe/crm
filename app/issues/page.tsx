import { AppShell } from "@/components/app-shell";
import { NewIssueForm } from "@/components/issues/new-issue-form";
import { createIssue } from "@/app/issues/actions";
import { EmptyTableRow } from "@/components/ui/empty-table-row";
import { FormModal } from "@/components/ui/form-modal";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusAlert } from "@/components/ui/status-alert";
import {
  StatusBadge,
  issueStatusTone,
  ticketPriorityTone
} from "@/components/ui/status-badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { issueCategories, issuePriorities, issueStatuses } from "@/lib/constants/issues";
import { formatDate } from "@/lib/format/date";
import type { Issue, IssueStatus } from "@/lib/types/issues";
import type { Business } from "@/lib/types/businesses";
import type { StaffUser } from "@/lib/types/users";
import Link from "next/link";

type IssuesPageProps = {
  searchParams?: {
    q?: string;
    status?: string;
    category?: string;
    assigned_to?: string;
    error?: string;
    success?: string;
  };
};

export default async function IssuesPage({ searchParams }: IssuesPageProps) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();

  const query = searchParams?.q?.trim() ?? "";
  const status = searchParams?.status ?? "";
  const category = searchParams?.category ?? "";
  const assignedTo = searchParams?.assigned_to ?? "";

  let issuesQuery = supabase.from("issues").select("*");

  if (query) {
    issuesQuery = issuesQuery.or(
      `title.ilike.%${query}%,category.ilike.%${query}%,description.ilike.%${query}%,closing_notes.ilike.%${query}%`
    );
  }

  if (issueStatuses.includes(status as IssueStatus)) {
    issuesQuery = issuesQuery.eq("status", status);
  }

  if (issueCategories.includes(category as never)) {
    issuesQuery = issuesQuery.eq("category", category);
  }

  if (assignedTo === "unassigned") {
    issuesQuery = issuesQuery.is("assigned_to", null);
  } else if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      assignedTo
    )
  ) {
    issuesQuery = issuesQuery.eq("assigned_to", assignedTo);
  }

  const [
    { data: issues },
    { data: staffMembers },
    { data: businesses }
  ] = await Promise.all([
    issuesQuery
      .order("created_at", { ascending: false })
      .returns<Issue[]>(),
    supabase
      .from("users")
      .select("*")
      .eq("status", "Active")
      .order("full_name", { ascending: true })
      .returns<StaffUser[]>(),
    supabase
      .from("businesses")
      .select("*")
      .order("business_name", { ascending: true })
      .returns<Business[]>()
  ]);

  const records = issues ?? [];
  const staffById = new Map(
    (staffMembers ?? []).map((staffMember) => [
      staffMember.user_id,
      staffMember.full_name
    ])
  );
  const businessById = new Map(
    (businesses ?? []).map((business) => [
      business.business_id,
      business.business_name
    ])
  );

  const openCount = records.filter((issue) => issue.status !== "Closed").length;
  const inProgressCount = records.filter(
    (issue) => issue.status === "In Progress"
  ).length;
  const closedCount = records.filter((issue) => issue.status === "Closed").length;

  return (
    <AppShell currentUser={currentUser} permissions={permissions}>
      <section>
        <PageHeader
          eyebrow="Issues"
          title="Knowledge Base"
          description="A durable log of every issue raised and how it was resolved. Use the closing notes to approach similar issues in the future."
          actions={
            <FormModal
              buttonLabel="+ Raise Issue"
              title="Raise Issue"
              description="Create a knowledge base entry. Assign it to a team member and close it with resolution notes once solved."
              size="wide"
            >
              <NewIssueForm
                action={createIssue}
                staffMembers={staffMembers ?? []}
                categories={issueCategories}
                priorities={issuePriorities}
                statuses={issueStatuses.filter((item) => item !== "Closed")}
              />
            </FormModal>
          }
        />

        <StatusAlert type="error" message={searchParams?.error} />
        <StatusAlert type="success" message={searchParams?.success} />

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Open", openCount],
            ["In Progress", inProgressCount],
            ["Resolved", closedCount],
            ["Total", records.length]
          ].map(([label, value]) => (
            <MetricCard
              key={label}
              label={String(label)}
              value={value}
              density="compact"
            />
          ))}
        </div>

        <div className="mt-6 rounded border border-neutral-200 bg-white p-4">
          <form className="grid gap-3 lg:grid-cols-[1fr_170px_190px_210px_auto]">
            <input
              name="q"
              defaultValue={query}
              placeholder="Search by title, category, description, or closing notes"
              className="rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
            />
            <select
              name="category"
              defaultValue={category}
              className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
            >
              <option value="">All categories</option>
              {issueCategories.map((item) => (
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
              {issueStatuses.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              name="assigned_to"
              defaultValue={assignedTo}
              className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
            >
              <option value="">All assignees</option>
              <option value="unassigned">Unassigned</option>
              {(staffMembers ?? []).map((staffMember) => (
                <option key={staffMember.user_id} value={staffMember.user_id}>
                  {staffMember.full_name}
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
                  <th className="px-4 py-3">Issue</th>
                  <th className="px-4 py-3">Business</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Assigned</th>
                  <th className="px-4 py-3">Raised</th>
                  <th className="px-4 py-3">Resolved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {records.map((issue) => (
                  <tr key={issue.issue_id}>
                    <td className="px-4 py-4">
                      <Link
                        href={`/issues/${issue.issue_id}`}
                        className="font-semibold text-payscribe-blue hover:underline"
                      >
                        {issue.title}
                      </Link>
                      <div className="mt-1 text-xs text-neutral-500">
                        {issue.category ?? "Uncategorised"}
                        {issue.linked_ticket_id ? (
                          <>
                            {" · "}
                            <Link
                              href={`/tickets/${issue.linked_ticket_id}`}
                              className="font-semibold hover:underline"
                            >
                              Ticket {issue.linked_ticket_id}
                            </Link>
                          </>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {issue.linked_business_id
                        ? businessById.get(issue.linked_business_id) ??
                          issue.linked_business_id
                        : "—"}
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge
                        label={issue.priority}
                        tone={ticketPriorityTone(issue.priority)}
                      />
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge
                        label={issue.status}
                        tone={issueStatusTone(issue.status)}
                      />
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {issue.assigned_to
                        ? staffById.get(issue.assigned_to) ?? "Unknown"
                        : "Unassigned"}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {formatDate(issue.created_at)}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {formatDate(issue.resolved_date)}
                    </td>
                  </tr>
                ))}

                {records.length === 0 ? (
                  <EmptyTableRow colSpan={7} message="No issues found." />
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
