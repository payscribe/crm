import { AppShell } from "@/components/app-shell";
import {
  StatusBadge,
  issueStatusTone,
  ticketPriorityTone
} from "@/components/ui/status-badge";
import { StatusAlert } from "@/components/ui/status-alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { issueCategories, issuePriorities, issueStatuses } from "@/lib/constants/issues";
import { formatDate } from "@/lib/format/date";
import type { Issue, IssueStatus } from "@/lib/types/issues";
import type { Business } from "@/lib/types/businesses";
import type { StaffUser } from "@/lib/types/users";
import Link from "next/link";
import { notFound } from "next/navigation";
import { closeIssue, updateIssue } from "../actions";

type IssueDetailPageProps = {
  params: {
    issueId: string;
  };
  searchParams?: {
    error?: string;
    success?: string;
  };
};

const inputClass =
  "mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20";
const selectClass =
  "mt-2 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20";

export default async function IssueDetailPage({
  params,
  searchParams
}: IssueDetailPageProps) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();

  const { data: issue, error } = await supabase
    .from("issues")
    .select("*")
    .eq("issue_id", params.issueId)
    .maybeSingle<Issue>();

  if (!issue || error) {
    notFound();
  }

  const [
    { data: staffMembers },
    { data: businesses },
    { data: linkedTicket }
  ] = await Promise.all([
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
      .returns<Business[]>(),
    issue.linked_ticket_id
      ? supabase
          .from("tickets")
          .select("ticket_id, subject")
          .eq("ticket_id", issue.linked_ticket_id)
          .maybeSingle<{ ticket_id: string; subject: string }>()
      : Promise.resolve({ data: null })
  ]);

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

  const canEdit =
    currentUser.is_super_admin ||
    issue.assigned_to === currentUser.user_id ||
    issue.created_by === currentUser.user_id;
  const isClosed = issue.status === "Closed";
  const editStatuses = issueStatuses.filter((status) => status !== "Closed");

  return (
    <AppShell currentUser={currentUser} permissions={permissions}>
      <section>
        <div className="flex flex-col gap-4 border-b border-neutral-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-payscribe-blue">
              Knowledge base · {issue.issue_id}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-normal text-neutral-950">
              {issue.title}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
              {issue.category ?? "Uncategorised"} ·{" "}
              {issue.linked_business_id
                ? businessById.get(issue.linked_business_id) ??
                  issue.linked_business_id
                : "No business linked"}
              {" · "}assigned to{" "}
              {issue.assigned_to
                ? staffById.get(issue.assigned_to) ?? "Unknown"
                : "Unassigned"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {issue.linked_ticket_id ? (
              <Link
                href={`/tickets/${issue.linked_ticket_id}`}
                className="rounded border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 transition hover:border-payscribe-blue hover:text-payscribe-blue"
              >
                View {linkedTicket?.subject ?? "Ticket"}
              </Link>
            ) : null}
            <Link
              href="/issues"
              className="rounded border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 transition hover:border-payscribe-blue hover:text-payscribe-blue"
            >
              Back to Knowledge Base
            </Link>
          </div>
        </div>

        <StatusAlert type="error" message={searchParams?.error} />
        <StatusAlert type="success" message={searchParams?.success} />

        {!canEdit ? (
          <div className="mt-6 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            You can view this issue. Only the assignee, the creator, or an admin
            can edit or close it.
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded border border-neutral-200 bg-white p-5">
            <p className="text-sm font-medium text-neutral-500">Status</p>
            <div className="mt-3">
              <StatusBadge label={issue.status} tone={issueStatusTone(issue.status)} />
            </div>
          </div>
          <div className="rounded border border-neutral-200 bg-white p-5">
            <p className="text-sm font-medium text-neutral-500">Priority</p>
            <div className="mt-3">
              <StatusBadge
                label={issue.priority}
                tone={ticketPriorityTone(issue.priority)}
              />
            </div>
          </div>
          <div className="rounded border border-neutral-200 bg-white p-5">
            <p className="text-sm font-medium text-neutral-500">Raised</p>
            <p className="mt-2 text-xl font-semibold text-neutral-950">
              {formatDate(issue.created_at)}
            </p>
          </div>
          <div className="rounded border border-neutral-200 bg-white p-5">
            <p className="text-sm font-medium text-neutral-500">Resolved</p>
            <p className="mt-2 text-xl font-semibold text-neutral-950">
              {formatDate(issue.resolved_date)}
            </p>
          </div>
          <div className="rounded border border-neutral-200 bg-white p-5">
            <p className="text-sm font-medium text-neutral-500">Raised by</p>
            <p className="mt-2 text-xl font-semibold text-neutral-950">
              {staffById.get(issue.created_by ?? "") ?? "Unknown"}
            </p>
          </div>
        </div>

        <div className="mt-6 rounded border border-neutral-200 bg-white p-5">
          <h3 className="text-base font-semibold text-neutral-950">
            Description
          </h3>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-700">
            {issue.description}
          </p>
        </div>

        {!isClosed && canEdit ? (
          <form
            action={updateIssue}
            className="mt-6 rounded border border-neutral-200 bg-white p-5"
          >
            <input type="hidden" name="issue_id" value={issue.issue_id} />
            <h3 className="text-base font-semibold text-neutral-950">
              Edit Issue
            </h3>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label className="block md:col-span-2">
                <span className="text-sm font-medium text-neutral-800">
                  Title
                </span>
                <input
                  required
                  name="title"
                  defaultValue={issue.title}
                  className={inputClass}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-neutral-800">
                  Category
                </span>
                <select
                  name="category"
                  defaultValue={issue.category ?? ""}
                  className={selectClass}
                >
                  <option value="">Select category</option>
                  {issueCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-neutral-800">
                  Priority
                </span>
                <select
                  required
                  name="priority"
                  defaultValue={issue.priority}
                  className={selectClass}
                >
                  {issuePriorities.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
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
                  defaultValue={issue.assigned_to ?? ""}
                  className={selectClass}
                >
                  <option value="">Select team member</option>
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
                  name="status"
                  defaultValue={issue.status}
                  className={selectClass}
                >
                  {editStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="mt-5 block">
              <span className="text-sm font-medium text-neutral-800">
                Description
              </span>
              <textarea
                required
                name="description"
                rows={4}
                defaultValue={issue.description}
                className={inputClass}
              />
            </label>

            <div className="mt-5 flex justify-end">
              <SubmitButton pendingText="Updating issue...">
                Update Issue
              </SubmitButton>
            </div>
          </form>
        ) : null}

        {!isClosed && canEdit ? (
          <form
            action={closeIssue}
            className="mt-6 rounded border border-neutral-200 bg-white p-5"
          >
            <input type="hidden" name="issue_id" value={issue.issue_id} />
            <h3 className="text-base font-semibold text-neutral-950">
              Close Issue
            </h3>
            <p className="mt-1 text-sm text-neutral-600">
              Closing an issue requires resolution notes describing how it was
              solved. These notes become the knowledge base insight for similar
              issues in the future.
            </p>
            <label className="mt-4 block">
              <span className="text-sm font-medium text-neutral-800">
                Closing notes
              </span>
              <textarea
                required
                name="closing_notes"
                rows={4}
                placeholder="e.g. Temporary holder decline from the sandbox network; raised a ticket with the issuing partner and added a retry with a 3DS challenge."
                className={inputClass}
              />
            </label>
            <div className="mt-5 flex justify-end">
              <SubmitButton variant="dark" pendingText="Closing issue...">
                Close Issue
              </SubmitButton>
            </div>
          </form>
        ) : null}

        {isClosed ? (
          <div className="mt-6 rounded border border-emerald-200 bg-emerald-50 p-5">
            <h3 className="text-base font-semibold text-neutral-950">
              Closing Notes
            </h3>
            <p className="mt-1 text-sm text-neutral-600">
              How this issue was resolved. Use this as reference for similar
              issues.
            </p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-neutral-800">
              {issue.closing_notes ?? "No closing notes recorded."}
            </p>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
