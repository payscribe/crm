"use server";

import { getCurrentUserContext } from "@/lib/auth/current-user";
import {
  queueTicketClosedEmail,
  queueTicketOpenedEmail
} from "@/lib/email/outbound-events";
import { deliverSlackEventsImmediately } from "@/lib/notifications/automation-delivery";
import { sendSlackChannelMessage } from "@/lib/notifications/slack";
import {
  ticketAssignedSlackMessage,
  ticketClosedSlackMessage,
  ticketNoteSlackMessage,
  ticketOpenedSlackMessage,
  withSlackMentions
} from "@/lib/notifications/ticket-messages";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { NewAutomationEvent } from "@/lib/types/automation-events";
import type { StaffUser } from "@/lib/types/users";
import {
  editableTicketStatuses,
  ticketAccountStatuses,
  ticketChannels,
  ticketInteractionModes,
  ticketPriorities,
  ticketCategories,
  ticketStatuses
} from "@/lib/constants/tickets";
import { hasModulePermission } from "@/lib/permissions/checks";
import { isActiveManagedOption } from "@/lib/settings/managed-options";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function requiredText(formData: FormData, key: string) {
  return optionalText(formData.get(key));
}

function ticketRedirect(ticketId: string, message: string): never {
  redirect(`/tickets/${ticketId}?error=${encodeURIComponent(message)}`);
}

async function getTicketStatus(
  supabase: Awaited<ReturnType<typeof getCurrentUserContext>>["supabase"],
  ticketId: string
) {
  const { data, error } = await supabase
    .from("tickets")
    .select("status")
    .eq("ticket_id", ticketId)
    .single<{ status: string }>();

  if (error || !data) {
    ticketRedirect(ticketId, error?.message ?? "Ticket not found");
  }

  return data.status;
}

function staffMentionKeys(fullName: string, email: string, slackUserId: string | null) {
  const nameKey = fullName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  const emailKey = email.split("@")[0]?.toLowerCase() ?? "";
  const keys = [nameKey, emailKey];

  if (slackUserId) {
    keys.push(slackUserId.toLowerCase());
  }

  return keys.filter(Boolean);
}

function mentionedUserIds(
  noteBody: string,
  staffMembers: Array<{
    user_id: string;
    full_name: string;
    email: string;
    slack_user_id: string | null;
  }>
) {
  const normalizedNote = noteBody.toLowerCase();
  const mentioned = new Set<string>();

  for (const staffMember of staffMembers) {
    const keys = staffMentionKeys(
      staffMember.full_name,
      staffMember.email,
      staffMember.slack_user_id
    );

    if (
      keys.some((key) =>
        new RegExp(`(^|\\s)@${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(
          normalizedNote
        )
      ) ||
      (staffMember.slack_user_id &&
        normalizedNote.includes(`<@${staffMember.slack_user_id.toLowerCase()}>`))
    ) {
      mentioned.add(staffMember.user_id);
    }
  }

  return mentioned;
}

async function validateTicketForm(
  supabase: Awaited<ReturnType<typeof getCurrentUserContext>>["supabase"],
  formData: FormData,
  redirectPath: string,
  existingTicket?: {
    issue_category: string;
    sub_category: string | null;
  }
) {
  const businessId = requiredText(formData, "business_id");
  const channelReceived = requiredText(formData, "channel_received");
  const issueCategory = requiredText(formData, "issue_category");
  const subCategory = optionalText(formData.get("sub_category"));
  const subject = requiredText(formData, "subject");
  const issueDescription = requiredText(formData, "issue_description");
  const interactionMode = requiredText(formData, "interaction_mode") ?? "Inbound";
  const accountStatus = requiredText(formData, "account_status") ?? "NA";
  const status = requiredText(formData, "status") ?? "Open";
  const resolutionNotes = optionalText(formData.get("resolution_notes"));
  const priority =
    status === "Closed" ? "Low" : requiredText(formData, "priority");
  const assignedTo =
    status === "Closed" ? null : requiredText(formData, "assigned_to");

  if (
    !businessId ||
    !channelReceived ||
    !issueCategory ||
    !subject ||
    !issueDescription ||
    !priority ||
    (status !== "Closed" && !assignedTo)
  ) {
    redirect(
      `${redirectPath}?error=Business,%20channel,%20category,%20subject,%20description,%20priority,%20and%20assignee%20are%20required`
    );
  }

  if (status === "Closed" && !resolutionNotes) {
    redirect(
      `${redirectPath}?error=Resolution%20is%20required%20before%20a%20ticket%20can%20be%20closed`
    );
  }

  if (!ticketChannels.includes(channelReceived as never)) {
    redirect(`${redirectPath}?error=Invalid%20ticket%20channel`);
  }

  if (!ticketCategories.includes(issueCategory as never)) {
    redirect(`${redirectPath}?error=Invalid%20issue%20category`);
  }

  if (
    subCategory &&
    !(
      existingTicket?.issue_category === issueCategory &&
      existingTicket?.sub_category === subCategory
    ) &&
    !(await isActiveManagedOption(
      supabase,
      "ticket_sub_category",
      subCategory,
      issueCategory
    ))
  ) {
    redirect(`${redirectPath}?error=Invalid%20ticket%20sub%20category`);
  }

  if (!ticketPriorities.includes(priority as never)) {
    redirect(`${redirectPath}?error=Invalid%20ticket%20priority`);
  }

  if (!ticketStatuses.includes(status as never)) {
    redirect(`${redirectPath}?error=Invalid%20ticket%20status`);
  }

  if (!ticketInteractionModes.includes(interactionMode as never)) {
    redirect(`${redirectPath}?error=Invalid%20ticket%20mode`);
  }

  if (!ticketAccountStatuses.includes(accountStatus as never)) {
    redirect(`${redirectPath}?error=Invalid%20account%20status`);
  }

  return {
    businessId,
    channelReceived,
    issueCategory,
    subCategory,
    subject,
    issueDescription,
    interactionMode,
    accountStatus,
    priority,
    assignedTo,
    status,
    resolutionNotes
  };
}

type TicketThreadInfo = {
  ticket_id: string;
  subject: string;
  business_id: string | null;
  issue_category: string;
  sub_category: string | null;
  priority: string;
  status: string;
  assigned_to: string | null;
  sla_deadline: string | null;
  resolution_notes?: string | null;
  slack_channel_id?: string | null;
  slack_thread_ts?: string | null;
};

type BusinessTicketContact = {
  business_name: string;
  email: string | null;
  owner_name: string | null;
};

function businessCustomerName(business: BusinessTicketContact | null) {
  return business?.owner_name ?? business?.business_name ?? null;
}

async function getBusinessTicketContact(
  supabase: Awaited<ReturnType<typeof getCurrentUserContext>>["supabase"],
  businessId: string
) {
  const { data } = await supabase
    .from("businesses")
    .select("business_name, email, owner_name")
    .eq("business_id", businessId)
    .maybeSingle<BusinessTicketContact>();

  return data ?? null;
}

async function createBusinessFromTicketForm({
  formData,
  permissions,
  currentUser,
  supabase
}: {
  formData: FormData;
  permissions: Awaited<ReturnType<typeof getCurrentUserContext>>["permissions"];
  currentUser: Awaited<ReturnType<typeof getCurrentUserContext>>["currentUser"];
  supabase: Awaited<ReturnType<typeof getCurrentUserContext>>["supabase"];
}) {
  if (optionalText(formData.get("create_business")) !== "yes") {
    return null;
  }

  if (!hasModulePermission(currentUser, permissions, "Businesses", "can_create")) {
    redirect(
      "/tickets?error=You%20need%20Businesses%20create%20permission%20to%20add%20a%20business%20from%20a%20ticket"
    );
  }

  const businessName = optionalText(formData.get("new_business_name"));
  const email = optionalText(formData.get("new_business_email"))?.toLowerCase();

  if (!businessName || !email) {
    redirect(
      "/tickets?error=New%20business%20name%20and%20email%20are%20required"
    );
  }

  const { data: createdBusiness, error } = await supabase
    .from("businesses")
    .insert({
      business_name: businessName,
      email,
      kyb_status: "Not Submitted",
      lifecycle_stage: "Registered",
      owner_name: optionalText(formData.get("new_business_owner_name")),
      phone: optionalText(formData.get("new_business_phone"))
    })
    .select("business_id")
    .single<{ business_id: string }>();

  if (error) {
    redirect(`/tickets?error=${encodeURIComponent(error.message)}`);
  }

  formData.set("business_id", createdBusiness.business_id);
  return createdBusiness.business_id;
}

function ticketAssignmentEvent({
  assignedTo,
  businessName,
  priority,
  slaDeadline,
  subject,
  ticketId
}: {
  assignedTo: string;
  businessName: string;
  priority: string;
  slaDeadline: string | null;
  subject: string;
  ticketId: string;
}): NewAutomationEvent {
  return {
    rule_key: "ticket_assigned",
    module: "Tickets",
    record_id: ticketId,
    target_user_id: assignedTo,
    target_channel: "slack_dm",
    message: ticketAssignedSlackMessage({
      assignedTo,
      businessName,
      priority,
      sla: slaDeadline,
      subject,
      ticketId
    }),
    dedupe_key: `ticket_assigned:${ticketId}:${assignedTo}`,
    payload: {
      assigned_to: assignedTo,
      business_name: businessName,
      priority,
      sla_deadline: slaDeadline,
      ticket_id: ticketId
    }
  };
}

async function tryGetTicketThreadInfo(
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>,
  ticketId: string
) {
  const { data } = await supabaseAdmin
    .from("tickets")
    .select(
      "ticket_id, subject, business_id, issue_category, sub_category, priority, status, assigned_to, sla_deadline, resolution_notes, slack_channel_id, slack_thread_ts"
    )
    .eq("ticket_id", ticketId)
    .maybeSingle<TicketThreadInfo>();

  return data;
}

async function ensureTicketSlackThread({
  supabaseAdmin,
  ticket,
  staffMembers
}: {
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>;
  ticket: TicketThreadInfo;
  staffMembers: Array<{
    user_id: string;
    full_name: string;
    slack_user_id?: string | null;
  }>;
}) {
  const token = process.env.SLACK_BOT_TOKEN;
  const channelId = process.env.SLACK_CRM_TICKETS_CHANNEL_ID;

  if (!token) {
    throw new Error("SLACK_BOT_TOKEN is not configured.");
  }

  if (!channelId) {
    throw new Error("SLACK_CRM_TICKETS_CHANNEL_ID is not configured.");
  }

  if (ticket.slack_thread_ts && ticket.slack_channel_id) {
    return {
      channelId: ticket.slack_channel_id,
      threadTs: ticket.slack_thread_ts
    };
  }

  const { data: business } = ticket.business_id
    ? await supabaseAdmin
        .from("businesses")
        .select("business_name, owner_name")
        .eq("business_id", ticket.business_id)
        .maybeSingle<{ business_name: string; owner_name: string | null }>()
    : { data: null };
  const assignee = ticket.assigned_to
    ? staffMembers.find((staffMember) => staffMember.user_id === ticket.assigned_to)
    : null;
  const message = withSlackMentions(
    ticketOpenedSlackMessage({
    assignedTo: assignee?.full_name ?? "Unassigned",
    businessName: business?.business_name ?? ticket.business_id ?? "Unmatched email",
    businessOwner: business?.owner_name,
    category: ticket.issue_category,
    priority: ticket.priority,
    sla: ticket.sla_deadline,
    subCategory: ticket.sub_category,
    subject: ticket.subject,
    ticketId: ticket.ticket_id
    }),
    [assignee?.slack_user_id]
  );
  const posted = await sendSlackChannelMessage({
    channelId,
    message,
    module: "Tickets",
    recordId: ticket.ticket_id,
    token
  });

  await supabaseAdmin
    .from("tickets")
    .update({
      slack_channel_id: posted.channelId,
      slack_thread_ts: posted.ts
    })
    .eq("ticket_id", ticket.ticket_id);

  return {
    channelId: posted.channelId,
    threadTs: posted.ts
  };
}

async function postTicketSlackThreadReply({
  supabaseAdmin,
  ticketId,
  message,
  failureMessage,
  mentionSlackUserIds = [],
  staffMembers
}: {
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>;
  ticketId: string;
  message: string;
  failureMessage: string;
  mentionSlackUserIds?: Array<string | null | undefined>;
  staffMembers: Array<{
    user_id: string;
    full_name: string;
    slack_user_id?: string | null;
  }>;
}) {
  const token = process.env.SLACK_BOT_TOKEN;

  if (!token) {
    return;
  }

  try {
    const ticket = await tryGetTicketThreadInfo(supabaseAdmin, ticketId);

    if (!ticket) {
      return;
    }

    const thread = await ensureTicketSlackThread({
      supabaseAdmin,
      ticket,
      staffMembers
    });

    if (!thread) {
      return;
    }

    await sendSlackChannelMessage({
      channelId: thread.channelId,
      message: withSlackMentions(message, mentionSlackUserIds),
      module: "Tickets",
      recordId: ticketId,
      threadTs: thread.threadTs,
      token
    });
  } catch (error) {
    await logTicketSlackChannelFailure({
      supabaseAdmin,
      ticketId,
      message: failureMessage,
      error
    });
  }
}

async function logTicketSlackChannelFailure({
  supabaseAdmin,
  ticketId,
  message,
  error
}: {
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>;
  ticketId: string;
  message: string;
  error: unknown;
}) {
  await supabaseAdmin.from("automation_events").upsert(
    {
      rule_key: "ticket_channel_thread_notification",
      module: "Tickets",
      record_id: ticketId,
      target_user_id: null,
      target_channel: "crm_tickets",
      message,
      status: "Failed",
      dedupe_key: `ticket_channel_thread_notification:${ticketId}:${Date.now()}`,
      payload: {
        ticket_id: ticketId
      },
      processed_at: new Date().toISOString(),
      error_message:
        error instanceof Error ? error.message : "Slack channel notification failed."
    },
    {
      onConflict: "dedupe_key"
    }
  );
}

export async function createTicket(formData: FormData) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();

  if (!hasModulePermission(currentUser, permissions, "Tickets", "can_create")) {
      redirect("/tickets?error=You%20do%20not%20have%20permission%20to%20create%20tickets");
  }

  const createdBusinessId = await createBusinessFromTicketForm({
    currentUser,
    formData,
    permissions,
    supabase
  });
  const values = await validateTicketForm(supabase, formData, "/tickets");
  const businessContact = await getBusinessTicketContact(
    supabase,
    values.businessId
  );
  const customerEmail = businessContact?.email ?? null;
  const customerName = businessCustomerName(businessContact);

  const { data: createdTicket, error } = await supabase
    .from("tickets")
    .insert({
      business_id: values.businessId,
      reported_by: optionalText(formData.get("reported_by")),
      channel_received: values.channelReceived,
      issue_category: values.issueCategory,
      sub_category: values.subCategory,
      subject: values.subject,
      issue_description: values.issueDescription,
      interaction_mode: values.interactionMode,
      account_status: values.accountStatus,
      priority: values.priority,
      assigned_to: values.assignedTo,
      status: values.status,
      resolution_notes: values.resolutionNotes,
      customer_email: customerEmail,
      customer_name: customerName,
      inbound_email_thread_id: customerEmail ? `manual:${crypto.randomUUID()}` : null,
      recurring_issue: formData.get("recurring_issue") === "on"
    })
    .select("ticket_id, customer_email, customer_name, inbound_email_thread_id")
    .single<{
      ticket_id: string;
      customer_email: string | null;
      customer_name: string | null;
      inbound_email_thread_id: string | null;
    }>();

  if (error) {
    redirect(`/tickets?error=${encodeURIComponent(error.message)}`);
  }

  const supabaseAdmin = createSupabaseAdminClient();

  try {
    await supabaseAdmin
      .from("tickets")
      .update({ created_by: currentUser.user_id })
      .eq("ticket_id", createdTicket.ticket_id);

    const [ticket, { data: staffMembers }] = await Promise.all([
      tryGetTicketThreadInfo(supabaseAdmin, createdTicket.ticket_id),
      supabaseAdmin
        .from("users")
        .select("*")
        .eq("status", "Active")
        .returns<StaffUser[]>()
    ]);

    if (ticket && ticket.status !== "Closed") {
      await ensureTicketSlackThread({
        supabaseAdmin,
        ticket,
        staffMembers: staffMembers ?? []
      });

      if (ticket.assigned_to) {
        await deliverSlackEventsImmediately({
          supabase: supabaseAdmin,
          staffMembers: staffMembers ?? [],
          events: [
            ticketAssignmentEvent({
              assignedTo: ticket.assigned_to,
              businessName: businessContact?.business_name ?? ticket.business_id ?? "Unmatched email",
              priority: ticket.priority,
              slaDeadline: ticket.sla_deadline,
              subject: ticket.subject,
              ticketId: ticket.ticket_id
            })
          ]
        });
      }
    }
  } catch (error) {
    await logTicketSlackChannelFailure({
      supabaseAdmin,
      ticketId: createdTicket.ticket_id,
      message: `Ticket channel notification failed for ${createdTicket.ticket_id}`,
      error
    });
  }

  let customerEmailStatus: "none" | "queued" | "failed" = "none";

  try {
    if (createdTicket.customer_email && createdTicket.inbound_email_thread_id) {
      if (values.status === "Closed" && values.resolutionNotes) {
        const queued = await queueTicketClosedEmail({
        customerEmail: createdTicket.customer_email,
        customerName: createdTicket.customer_name,
        gmailThreadId: createdTicket.inbound_email_thread_id,
        supabase: supabaseAdmin,
        ticketId: createdTicket.ticket_id
      });
        customerEmailStatus = queued ? "queued" : "failed";
      } else if (values.status === "Open") {
        const queued = await queueTicketOpenedEmail({
          customerEmail: createdTicket.customer_email,
          customerName: createdTicket.customer_name,
          gmailThreadId: createdTicket.inbound_email_thread_id,
          subject: values.subject,
          supabase: supabaseAdmin,
          ticketId: createdTicket.ticket_id
        });
        customerEmailStatus = queued ? "queued" : "failed";
      }
    }
  } catch {
    customerEmailStatus = "failed";
  }

  revalidatePath("/");
  revalidatePath("/tickets");
  const customerEmailMessage =
    customerEmailStatus === "queued"
      ? ",%20customer%20email%20queued"
      : customerEmailStatus === "failed"
        ? ",%20but%20customer%20email%20could%20not%20be%20queued"
        : customerEmail
          ? ""
          : ",%20no%20business%20email%20found";

  redirect(
    `/tickets?success=Ticket%20${createdTicket.ticket_id}%20created${createdBusinessId ? "%20with%20new%20business" : ""}${customerEmailMessage}`
  );
}

export async function updateTicket(formData: FormData) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();
  const ticketId = optionalText(formData.get("ticket_id"));

  if (!ticketId) {
    redirect("/tickets?error=Ticket%20is%20required");
  }

  if (!hasModulePermission(currentUser, permissions, "Tickets", "can_edit")) {
    ticketRedirect(ticketId, "You do not have permission to edit tickets");
  }

  const currentStatus = await getTicketStatus(supabase, ticketId);

  if (currentStatus === "Closed") {
    ticketRedirect(ticketId, "Closed tickets cannot be edited or updated");
  }

  const { data: previousTicket } = await supabase
    .from("tickets")
    .select("issue_category, sub_category, inbound_email_thread_id, source, customer_email, customer_name, assigned_to")
    .eq("ticket_id", ticketId)
    .maybeSingle<{
      issue_category: string;
      sub_category: string | null;
      inbound_email_thread_id: string | null;
      source: string | null;
      customer_email: string | null;
      customer_name: string | null;
      assigned_to: string | null;
    }>();

  const values = await validateTicketForm(
    supabase,
    formData,
    `/tickets/${ticketId}`,
    previousTicket ?? undefined
  );

  if (!editableTicketStatuses.includes(values.status as never)) {
    ticketRedirect(ticketId, "Use the close confirmation action to close tickets");
  }

  const businessContact = await getBusinessTicketContact(
    supabase,
    values.businessId
  );
  const updatedCustomerEmail =
    previousTicket?.source === "Email"
      ? previousTicket.customer_email
      : businessContact?.email ?? null;
  const updatedCustomerName =
    previousTicket?.source === "Email"
      ? previousTicket.customer_name
      : businessCustomerName(businessContact);

  const { error } = await supabase
    .from("tickets")
    .update({
      business_id: values.businessId,
      reported_by: optionalText(formData.get("reported_by")),
      channel_received: values.channelReceived,
      issue_category: values.issueCategory,
      sub_category: values.subCategory,
      subject: values.subject,
      issue_description: values.issueDescription,
      interaction_mode: values.interactionMode,
      account_status: values.accountStatus,
      priority: values.priority,
      assigned_to: values.assignedTo,
      status: values.status,
      resolution_notes: values.resolutionNotes,
      customer_email: updatedCustomerEmail,
      customer_name: updatedCustomerName,
      inbound_email_thread_id:
        previousTicket?.inbound_email_thread_id ??
        (updatedCustomerEmail ? `manual:${crypto.randomUUID()}` : null),
      recurring_issue: formData.get("recurring_issue") === "on"
    })
    .eq("ticket_id", ticketId);

  if (error) {
    redirect(`/tickets/${ticketId}?error=${encodeURIComponent(error.message)}`);
  }

  if (values.assignedTo && previousTicket?.assigned_to !== values.assignedTo) {
    try {
      const supabaseAdmin = createSupabaseAdminClient();
      const { data: staffMembers } = await supabaseAdmin
        .from("users")
        .select("*")
        .eq("status", "Active")
        .returns<StaffUser[]>();

      await deliverSlackEventsImmediately({
        supabase: supabaseAdmin,
        staffMembers: staffMembers ?? [],
        events: [
          ticketAssignmentEvent({
            assignedTo: values.assignedTo,
            businessName: businessContact?.business_name ?? values.businessId,
            priority: values.priority,
            slaDeadline: null,
            subject: values.subject,
            ticketId
          })
        ]
      });
    } catch {
      // Assignment DMs should not block ticket updates.
    }
  }

  revalidatePath("/");
  revalidatePath("/tickets");
  revalidatePath(`/tickets/${ticketId}`);
  redirect(`/tickets/${ticketId}?success=Ticket%20updated`);
}

export async function closeTicket(formData: FormData) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();
  const ticketId = optionalText(formData.get("ticket_id"));

  if (!ticketId) {
    redirect("/tickets?error=Ticket%20is%20required");
  }

  if (!hasModulePermission(currentUser, permissions, "Tickets", "can_edit")) {
    ticketRedirect(ticketId, "You do not have permission to close tickets");
  }

  const currentStatus = await getTicketStatus(supabase, ticketId);

  if (currentStatus === "Closed") {
    ticketRedirect(ticketId, "Closed tickets cannot be edited or updated");
  }

  const resolutionNotes = optionalText(formData.get("resolution_notes"));

  if (!resolutionNotes) {
    ticketRedirect(ticketId, "Resolution is required before a ticket can be closed");
  }

  const { data: ticketForEmail } = await supabase
    .from("tickets")
    .select("ticket_id, business_id, customer_email, customer_name, inbound_email_thread_id, closure_notified_at")
    .eq("ticket_id", ticketId)
    .maybeSingle<{
      ticket_id: string;
      business_id: string | null;
      customer_email: string | null;
      customer_name: string | null;
      inbound_email_thread_id: string | null;
      closure_notified_at: string | null;
    }>();

  const closureBusinessContact = ticketForEmail?.business_id
    ? await getBusinessTicketContact(supabase, ticketForEmail.business_id)
    : null;
  const closureCustomerEmail =
    ticketForEmail?.customer_email ?? closureBusinessContact?.email ?? null;
  const closureCustomerName =
    ticketForEmail?.customer_name ?? businessCustomerName(closureBusinessContact);
  const closureGmailThreadId =
    ticketForEmail?.inbound_email_thread_id ??
    (closureCustomerEmail ? `manual:${crypto.randomUUID()}` : null);

  const { error } = await supabase
    .from("tickets")
    .update({
      status: "Closed",
      resolution_notes: resolutionNotes
    })
    .eq("ticket_id", ticketId);

  if (error) {
    redirect(`/tickets/${ticketId}?error=${encodeURIComponent(error.message)}`);
  }

  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const { data: staffMembers } = await supabaseAdmin
      .from("users")
      .select("user_id, full_name")
      .eq("status", "Active")
      .returns<Array<{ user_id: string; full_name: string }>>();

    await postTicketSlackThreadReply({
      supabaseAdmin,
      ticketId,
      staffMembers: staffMembers ?? [],
      failureMessage: `Ticket close thread notification failed for ${ticketId}`,
      message: ticketClosedSlackMessage({
        closedBy: currentUser.full_name,
        resolution: resolutionNotes,
        ticketId
      })
    });
  } catch {
    // Slack thread updates should not block closure.
  }

  let closureEmailQueued = false;

  if (
    closureCustomerEmail &&
    closureGmailThreadId &&
    !ticketForEmail?.closure_notified_at
  ) {
    try {
      const supabaseAdmin = createSupabaseAdminClient();
      closureEmailQueued = await queueTicketClosedEmail({
        customerEmail: closureCustomerEmail,
        customerName: closureCustomerName,
        gmailThreadId: closureGmailThreadId,
        supabase: supabaseAdmin,
        ticketId
      });
    } catch {
      closureEmailQueued = false;
    }
  }

  revalidatePath("/");
  revalidatePath("/tickets");
  revalidatePath(`/tickets/${ticketId}`);
  redirect(
    closureCustomerEmail && closureGmailThreadId
      ? closureEmailQueued
        ? "/tickets?success=Ticket%20closed,%20customer%20closure%20reply%20queued"
        : "/tickets?success=Ticket%20closed,%20but%20customer%20closure%20reply%20could%20not%20be%20queued"
      : "/tickets?success=Ticket%20closed"
  );
}

export async function addTicketNote(formData: FormData) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();
  const ticketId = optionalText(formData.get("ticket_id"));
  const noteBody = optionalText(formData.get("note_body"));
  const explicitMentionedUserIds = new Set(
    formData
      .getAll("mentioned_user_ids")
      .map((value) => String(value).trim())
      .filter(Boolean)
  );

  if (!ticketId) {
    redirect("/tickets?error=Ticket%20is%20required");
  }

  if (!hasModulePermission(currentUser, permissions, "Tickets", "can_edit")) {
    ticketRedirect(ticketId, "You do not have permission to add ticket notes");
  }

  if (!noteBody) {
    ticketRedirect(ticketId, "Note cannot be empty");
  }

  const currentStatus = await getTicketStatus(supabase, ticketId);

  if (currentStatus === "Closed") {
    ticketRedirect(ticketId, "Closed tickets cannot be edited or updated");
  }

  const [
    { data: ticket, error: ticketError },
    { data: staffMembers }
  ] = await Promise.all([
    supabase
      .from("tickets")
      .select("ticket_id, subject, business_id, assigned_to")
      .eq("ticket_id", ticketId)
      .single<{
        ticket_id: string;
        subject: string;
        business_id: string;
        assigned_to: string | null;
      }>(),
    supabase
      .from("users")
      .select("*")
      .eq("status", "Active")
      .returns<
        Array<{
          user_id: string;
          full_name: string;
          email: string;
          job_title: string | null;
          department: string | null;
          slack_user_id: string | null;
          status: "Active" | "Inactive";
          is_super_admin: boolean;
          last_login_at: string | null;
          created_at: string;
          updated_at: string;
        }>
      >()
  ]);

  if (!ticket) {
    ticketRedirect(ticketId, ticketError?.message ?? "Ticket not found");
  }

  let ticketCreatorUserId: string | null = null;
  let supabaseAdmin: ReturnType<typeof createSupabaseAdminClient> | null = null;

  try {
    supabaseAdmin = createSupabaseAdminClient();
    const { data: ticketCreator } = await supabaseAdmin
      .from("tickets")
      .select("created_by")
      .eq("ticket_id", ticketId)
      .maybeSingle<{ created_by: string | null }>();
    ticketCreatorUserId = ticketCreator?.created_by ?? null;
  } catch {
    // If Step 8 has not been applied yet, notes still work without opener DMs.
  }

  const { data: note, error } = await supabase
    .from("ticket_notes")
    .insert({
      ticket_id: ticketId,
      note_body: noteBody,
      created_by: currentUser.user_id
    })
    .select("note_id")
    .single<{ note_id: string }>();

  if (error) {
    ticketRedirect(ticketId, error.message);
  }

  const notifiedUserIds = new Set<string>();

  if (ticketCreatorUserId) {
    notifiedUserIds.add(ticketCreatorUserId);
  }

  if (ticket.assigned_to) {
    notifiedUserIds.add(ticket.assigned_to);
  }

  for (const userId of explicitMentionedUserIds) {
    if ((staffMembers ?? []).some((staffMember) => staffMember.user_id === userId)) {
      notifiedUserIds.add(userId);
    }
  }

  for (const userId of mentionedUserIds(noteBody, staffMembers ?? [])) {
    notifiedUserIds.add(userId);
  }

  // Keep the author in the recipient list when they are the opener, assignee,
  // or explicitly selected in the mention picker.
  const authorName = currentUser.full_name;
  const preview =
    noteBody.length > 180 ? `${noteBody.slice(0, 177).trim()}...` : noteBody;
  const noteMessage = ticketNoteSlackMessage({
    addedBy: authorName,
    note: preview,
    subject: ticket.subject,
    ticketId
  });
  const events: NewAutomationEvent[] = Array.from(notifiedUserIds).map(
    (userId) => ({
      rule_key: "ticket_note_added",
      module: "Tickets",
      record_id: ticketId,
      target_user_id: userId,
      target_channel: "slack_dm",
      message: noteMessage,
      dedupe_key: `ticket_note_added:${note?.note_id}:${userId}`,
      payload: {
        ticket_id: ticketId,
        note_id: note?.note_id,
        subject: ticket.subject,
        added_by: currentUser.user_id,
        selected_mentions: Array.from(explicitMentionedUserIds)
      }
    })
  );

  if (events.length > 0) {
    supabaseAdmin = supabaseAdmin ?? createSupabaseAdminClient();
    const result = await deliverSlackEventsImmediately({
      supabase: supabaseAdmin,
      events,
      staffMembers: staffMembers ?? []
    });
  }

  supabaseAdmin = supabaseAdmin ?? createSupabaseAdminClient();
  const mentionSlackUserIds = Array.from(notifiedUserIds)
    .map(
      (userId) =>
        (staffMembers ?? []).find((staffMember) => staffMember.user_id === userId)
          ?.slack_user_id
    )
    .filter(Boolean);

  await postTicketSlackThreadReply({
    supabaseAdmin,
    ticketId,
    staffMembers: staffMembers ?? [],
    failureMessage: `Ticket note thread notification failed for ${ticketId}`,
    mentionSlackUserIds,
    message: noteMessage
  });

  revalidatePath(`/tickets/${ticketId}`);
  redirect(`/tickets/${ticketId}?success=Note%20added`);
}
