"use server";

import { getCurrentUserContext } from "@/lib/auth/current-user";
import { issueCategories, issuePriorities, issueStatuses } from "@/lib/constants/issues";
import { deliverSlackEventsImmediately } from "@/lib/notifications/automation-delivery";
import { slackFieldTable } from "@/lib/notifications/ticket-messages";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Issue } from "@/lib/types/issues";
import type { StaffUser } from "@/lib/types/users";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function requiredText(formData: FormData, key: string) {
  return optionalText(formData.get(key));
}

function issueError(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function canManipulateIssue(currentUserId: string, issue: Issue) {
  return (
    issue.assigned_to === currentUserId || issue.created_by === currentUserId
  );
}

async function findIssue(supabase: SupabaseClient, issueId: string) {
  const { data } = await supabase
    .from("issues")
    .select("*")
    .eq("issue_id", issueId)
    .maybeSingle<Issue>();
  return data ?? null;
}

async function resolveLinkedBusinessId(
  supabase: SupabaseClient,
  linkedTicketId: string | null
) {
  if (!linkedTicketId) {
    return { linkedTicketId: null, linkedBusinessId: null };
  }

  const { data } = await supabase
    .from("tickets")
    .select("business_id")
    .eq("ticket_id", linkedTicketId)
    .maybeSingle<{ business_id: string | null }>();

  return { linkedTicketId, linkedBusinessId: data?.business_id ?? null };
}

async function activeStaffMembers(
  supabaseAdmin: SupabaseClient
) {
  const { data } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("status", "Active")
    .returns<StaffUser[]>();

  return data ?? [];
}

async function notifyIssueAssignee({
  supabaseAdmin,
  issueId,
  assignedTo,
  message,
  dedupeKey,
  staffMembers
}: {
  supabaseAdmin: SupabaseClient;
  issueId: string;
  assignedTo: string | null;
  message: string;
  dedupeKey: string;
  staffMembers: StaffUser[];
}) {
  if (!assignedTo) {
    return;
  }

  await deliverSlackEventsImmediately({
    supabase: supabaseAdmin,
    events: [
      {
        rule_key: "issue_assignee_notification",
        module: "Issues",
        record_id: issueId,
        target_user_id: assignedTo,
        target_channel: "slack_dm",
        message,
        dedupe_key: dedupeKey,
        payload: {
          issue_id: issueId
        }
      }
    ],
    staffMembers
  });
}

export async function createIssue(formData: FormData) {
  const { supabase, currentUser } = await getCurrentUserContext();
  const returnTo = "/issues";

  const title = requiredText(formData, "title");
  const description = requiredText(formData, "description");
  const assignedTo = requiredText(formData, "assigned_to");
  const linkedTicketId = optionalText(formData.get("linked_ticket_id"));

  if (!title || !description || !assignedTo) {
    issueError(returnTo, "Title, description, and assignee are required");
  }

  const category = optionalText(formData.get("category"));
  if (category && !issueCategories.includes(category as never)) {
    issueError(returnTo, "Invalid issue category");
  }

  const priority = requiredText(formData, "priority") ?? "Medium";
  if (!issuePriorities.includes(priority as never)) {
    issueError(returnTo, "Invalid issue priority");
  }

  const status = requiredText(formData, "status") ?? "Open";
  if (!issueStatuses.includes(status as never) || status === "Closed") {
    issueError(returnTo, "Invalid issue status");
  }

  const { linkedBusinessId } = await resolveLinkedBusinessId(
    supabase,
    linkedTicketId
  );

  const { data: created, error } = await supabase
    .from("issues")
    .insert({
      title,
      category,
      description,
      priority,
      assigned_to: assignedTo,
      status,
      linked_ticket_id: linkedTicketId,
      linked_business_id: linkedBusinessId,
      created_by: currentUser.user_id
    })
    .select("issue_id")
    .single<{ issue_id: string }>();

  if (error) {
    issueError(returnTo, error.message);
  }

  const supabaseAdmin = createSupabaseAdminClient();
  await notifyIssueAssignee({
    supabaseAdmin,
    issueId: created.issue_id,
    assignedTo,
    staffMembers: await activeStaffMembers(supabaseAdmin),
    dedupeKey: `issue_created_assignee:${created.issue_id}`,
    message: slackFieldTable("ISSUE ASSIGNED", [
      ["Issue ID", created.issue_id],
      ["Title", title],
      ["Category", category ?? "—"],
      ["Priority", priority],
      ["Status", status]
    ])
  });

  revalidatePath("/issues");
  if (linkedTicketId) {
    revalidatePath(`/tickets/${linkedTicketId}`);
  }
  redirect(`/issues/${created.issue_id}?success=Issue%20created`);
}

export async function updateIssue(formData: FormData) {
  const { supabase, currentUser } = await getCurrentUserContext();
  const issueId = optionalText(formData.get("issue_id"));
  const detailPath = issueId ? `/issues/${issueId}` : "/issues";

  if (!issueId) {
    issueError("/issues", "Issue is required");
  }

  const issue = await findIssue(supabase, issueId);
  if (!issue) {
    issueError(detailPath, "Issue not found");
  }

  if (!canManipulateIssue(currentUser.user_id, issue)) {
    issueError(detailPath, "You do not have permission to edit this issue");
  }

  if (issue.status === "Closed") {
    issueError(detailPath, "Closed issues cannot be edited");
  }

  const title = requiredText(formData, "title");
  const description = requiredText(formData, "description");
  const assignedTo = requiredText(formData, "assigned_to");

  if (!title || !description || !assignedTo) {
    issueError(detailPath, "Title, description, and assignee are required");
  }

  const category = optionalText(formData.get("category"));
  if (category && !issueCategories.includes(category as never)) {
    issueError(detailPath, "Invalid issue category");
  }

  const priority = requiredText(formData, "priority") ?? "Medium";
  if (!issuePriorities.includes(priority as never)) {
    issueError(detailPath, "Invalid issue priority");
  }

  const status = requiredText(formData, "status") ?? issue.status;
  if (!issueStatuses.includes(status as never) || status === "Closed") {
    issueError(detailPath, "Invalid issue status");
  }

  const { error } = await supabase
    .from("issues")
    .update({
      title,
      category,
      description,
      priority,
      assigned_to: assignedTo,
      status
    })
    .eq("issue_id", issueId);

  if (error) {
    issueError(detailPath, error.message);
  }

  revalidatePath("/issues");
  revalidatePath(detailPath);
  redirect(`${detailPath}?success=Issue%20updated`);
}

export async function closeIssue(formData: FormData) {
  const { supabase, currentUser } = await getCurrentUserContext();
  const issueId = optionalText(formData.get("issue_id"));
  const detailPath = issueId ? `/issues/${issueId}` : "/issues";

  if (!issueId) {
    issueError("/issues", "Issue is required");
  }

  const issue = await findIssue(supabase, issueId);
  if (!issue) {
    issueError(detailPath, "Issue not found");
  }

  if (!canManipulateIssue(currentUser.user_id, issue)) {
    issueError(detailPath, "You do not have permission to close this issue");
  }

  if (issue.status === "Closed") {
    issueError(detailPath, "This issue is already closed");
  }

  const closingNotes = requiredText(formData, "closing_notes");
  if (!closingNotes) {
    issueError(detailPath, "Closing notes are required");
  }

  const { error } = await supabase
    .from("issues")
    .update({
      status: "Closed",
      closing_notes: closingNotes,
      resolved_date: new Date().toISOString()
    })
    .eq("issue_id", issueId);

  if (error) {
    issueError(detailPath, error.message);
  }

  revalidatePath("/issues");
  revalidatePath(detailPath);
  redirect(`${detailPath}?success=Issue%20closed`);
}
