"use server";

import { getCurrentUserContext } from "@/lib/auth/current-user";
import { deliverSlackEventsImmediately } from "@/lib/notifications/automation-delivery";
import { sendSlackChannelMessage } from "@/lib/notifications/slack";
import {
  slackFieldTable,
  withSlackMentions
} from "@/lib/notifications/ticket-messages";
import {
  leadCommunicationChannels,
  leadCommunicationDirections,
  leadSources,
  leadStages,
  leadStatuses
} from "@/lib/constants/leads";
import type { LeadStage, LeadStatus } from "@/lib/types/leads";
import { hasModulePermission } from "@/lib/permissions/checks";
import { getLeadProductInterestOptions } from "@/lib/settings/managed-options";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { NewAutomationEvent } from "@/lib/types/automation-events";
import type { StaffUser } from "@/lib/types/users";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function requiredText(formData: FormData, key: string) {
  return optionalText(formData.get(key));
}

type LeadThreadInfo = {
  lead_id: string;
  full_name: string;
  business_name: string | null;
  source: string;
  product_interest: string[];
  stage: string;
  status: string;
  assigned_to: string;
  next_followup_date: string;
  notes: string | null;
  linked_business_id: string | null;
  slack_channel_id?: string | null;
  slack_thread_ts?: string | null;
};

async function activeStaffMembers(
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>
) {
  const { data } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("status", "Active")
    .returns<StaffUser[]>();

  return data ?? [];
}

async function tryGetLeadThreadInfo(
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>,
  leadId: string
) {
  const { data } = await supabaseAdmin
    .from("leads")
    .select(
      "lead_id, full_name, business_name, source, product_interest, stage, status, assigned_to, next_followup_date, notes, linked_business_id, slack_channel_id, slack_thread_ts"
    )
    .eq("lead_id", leadId)
    .maybeSingle<LeadThreadInfo>();

  return data;
}

async function ensureLeadSlackThread({
  supabaseAdmin,
  lead,
  staffMembers
}: {
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>;
  lead: LeadThreadInfo;
  staffMembers: StaffUser[];
}) {
  const token = process.env.SLACK_BOT_TOKEN;
  const channelId = process.env.SLACK_CRM_TICKETS_CHANNEL_ID;

  if (!token || !channelId) {
    return null;
  }

  if (lead.slack_thread_ts && lead.slack_channel_id) {
    return {
      channelId: lead.slack_channel_id,
      threadTs: lead.slack_thread_ts
    };
  }

  const assignee = staffMembers.find(
    (staffMember) => staffMember.user_id === lead.assigned_to
  );
  const message = withSlackMentions(slackFieldTable("NEW LEAD", [
    ["Lead ID", lead.lead_id],
    ["Lead name", lead.full_name],
    ["Business Name", lead.business_name],
    ["Source", lead.source],
    ["Product interest", lead.product_interest.join(", ")],
    ["Stage", lead.stage],
    ["Status", lead.status],
    ["Assigned to", assignee?.full_name ?? "Unassigned"],
    ["Next follow-up", lead.next_followup_date]
  ]), [assignee?.slack_user_id]);
  const posted = await sendSlackChannelMessage({
    channelId,
    message,
    module: "Leads",
    recordId: lead.lead_id,
    token
  });

  await supabaseAdmin
    .from("leads")
    .update({
      slack_channel_id: posted.channelId,
      slack_thread_ts: posted.ts
    })
    .eq("lead_id", lead.lead_id);

  return {
    channelId: posted.channelId,
    threadTs: posted.ts
  };
}

async function logLeadSlackChannelFailure({
  supabaseAdmin,
  leadId,
  message,
  error
}: {
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>;
  leadId: string;
  message: string;
  error: unknown;
}) {
  await supabaseAdmin.from("automation_events").upsert(
    {
      rule_key: "lead_channel_thread_notification",
      module: "Leads",
      record_id: leadId,
      target_user_id: null,
      target_channel: "crm_tickets",
      message,
      status: "Failed",
      dedupe_key: `lead_channel_thread_notification:${leadId}:${Date.now()}`,
      payload: {
        lead_id: leadId
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

async function postLeadSlackThreadReply({
  supabaseAdmin,
  leadId,
  message,
  failureMessage,
  staffMembers
}: {
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>;
  leadId: string;
  message: string;
  failureMessage: string;
  staffMembers: StaffUser[];
}) {
  const token = process.env.SLACK_BOT_TOKEN;

  if (!token) {
    return;
  }

  try {
    const lead = await tryGetLeadThreadInfo(supabaseAdmin, leadId);

    if (!lead) {
      return;
    }

    const thread = await ensureLeadSlackThread({
      supabaseAdmin,
      lead,
      staffMembers
    });

    if (!thread) {
      return;
    }

    await sendSlackChannelMessage({
      channelId: thread.channelId,
      message,
      module: "Leads",
      recordId: leadId,
      threadTs: thread.threadTs,
      token
    });
  } catch (error) {
    await logLeadSlackChannelFailure({
      supabaseAdmin,
      leadId,
      message: failureMessage,
      error
    });
  }
}

async function notifyLeadAssignee({
  supabaseAdmin,
  leadId,
  assignedTo,
  message,
  dedupeKey,
  staffMembers
}: {
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>;
  leadId: string;
  assignedTo: string | null;
  message: string;
  dedupeKey: string;
  staffMembers: StaffUser[];
}) {
  if (!assignedTo) {
    return;
  }

  const events: NewAutomationEvent[] = [
    {
      rule_key: "lead_assignee_notification",
      module: "Leads",
      record_id: leadId,
      target_user_id: assignedTo,
      target_channel: "slack_dm",
      message,
      dedupe_key: dedupeKey,
      payload: {
        lead_id: leadId
      }
    }
  ];

  await deliverSlackEventsImmediately({
    supabase: supabaseAdmin,
    events,
    staffMembers
  });
}

export async function createLead(formData: FormData) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();

  if (!hasModulePermission(currentUser, permissions, "Leads", "can_create")) {
    redirect("/leads?error=You%20do%20not%20have%20permission%20to%20create%20leads");
  }

  const fullName = requiredText(formData, "full_name");
  const phone = requiredText(formData, "phone");
  const source = requiredText(formData, "source");
  const stage = requiredText(formData, "stage") ?? "New";
  const status = requiredText(formData, "status") ?? "Warm";
  const assignedTo = requiredText(formData, "assigned_to");
  const nextFollowupDate = requiredText(formData, "next_followup_date");
  const referralSourceName = optionalText(formData.get("referral_source_name"));

  if (!fullName || !phone || !source || !assignedTo || !nextFollowupDate) {
    redirect("/leads?error=Name,%20phone,%20source,%20assignee,%20and%20follow-up%20date%20are%20required");
  }

  if (!leadSources.includes(source as never)) {
    redirect("/leads?error=Invalid%20lead%20source");
  }

  if (source === "Referral" && !referralSourceName) {
    redirect("/leads?error=Referral%20source%20name%20is%20required");
  }

  if (!leadStages.includes(stage as never)) {
    redirect("/leads?error=Invalid%20lead%20stage");
  }

  if (!leadStatuses.includes(status as never)) {
    redirect("/leads?error=Invalid%20lead%20status");
  }

  const activeProductInterests = await getLeadProductInterestOptions(supabase);
  const productInterest = formData
    .getAll("product_interest")
    .map((value) => String(value))
    .filter((value) => activeProductInterests.includes(value));

  if (productInterest.length === 0) {
    redirect("/leads?error=At%20least%20one%20product%20interest%20is%20required");
  }

  const lastMessageSummary = optionalText(formData.get("last_message_summary"));

  if (lastMessageSummary && lastMessageSummary.length > 200) {
    redirect("/leads?error=Last%20message%20summary%20must%20be%20200%20characters%20or%20less");
  }

  const { data: createdLead, error } = await supabase
    .from("leads")
    .insert({
      full_name: fullName,
      business_name: optionalText(formData.get("business_name")),
      phone,
      email: optionalText(formData.get("email")),
      source,
      referral_source_name: referralSourceName,
      product_interest: productInterest,
      stage,
      status,
      assigned_to: assignedTo,
      next_followup_date: nextFollowupDate,
      last_message_summary: lastMessageSummary,
      notes: optionalText(formData.get("notes"))
    })
    .select("lead_id")
    .single<{ lead_id: string }>();

  if (error) {
    redirect(`/leads?error=${encodeURIComponent(error.message)}`);
  }

  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const [lead, staffMembers] = await Promise.all([
      tryGetLeadThreadInfo(supabaseAdmin, createdLead.lead_id),
      activeStaffMembers(supabaseAdmin)
    ]);

    if (lead) {
      await ensureLeadSlackThread({
        supabaseAdmin,
        lead,
        staffMembers
      });
      await notifyLeadAssignee({
        supabaseAdmin,
        leadId: lead.lead_id,
        assignedTo: lead.assigned_to,
        staffMembers,
        dedupeKey: `lead_created_assignee:${lead.lead_id}`,
        message: slackFieldTable("LEAD ASSIGNED", [
          ["Lead ID", lead.lead_id],
          ["Lead name", lead.full_name],
          ["Business Name", lead.business_name],
          ["Stage", lead.stage],
          ["Status", lead.status],
          ["Next follow-up", lead.next_followup_date]
        ])
      });
    }
  } catch (slackError) {
    const supabaseAdmin = createSupabaseAdminClient();
    await logLeadSlackChannelFailure({
      supabaseAdmin,
      leadId: createdLead.lead_id,
      message: `Lead channel notification failed for ${createdLead.lead_id}`,
      error: slackError
    });
  }

  revalidatePath("/");
  revalidatePath("/leads");
  redirect(`/leads?success=Lead%20${createdLead.lead_id}%20created`);
}

async function validateLeadForm(
  supabase: Awaited<ReturnType<typeof getCurrentUserContext>>["supabase"],
  formData: FormData,
  redirectPath: string,
  existingProductInterest: string[] = []
) {
  const fullName = requiredText(formData, "full_name");
  const phone = requiredText(formData, "phone");
  const source = requiredText(formData, "source");
  const stage = requiredText(formData, "stage") ?? "New";
  const status = requiredText(formData, "status") ?? "Warm";
  const assignedTo = requiredText(formData, "assigned_to");
  const nextFollowupDate = requiredText(formData, "next_followup_date");
  const referralSourceName = optionalText(formData.get("referral_source_name"));

  if (!fullName || !phone || !source || !assignedTo || !nextFollowupDate) {
    redirect(`${redirectPath}?error=Name,%20phone,%20source,%20assignee,%20and%20follow-up%20date%20are%20required`);
  }

  if (!leadSources.includes(source as never)) {
    redirect(`${redirectPath}?error=Invalid%20lead%20source`);
  }

  if (source === "Referral" && !referralSourceName) {
    redirect(`${redirectPath}?error=Referral%20source%20name%20is%20required`);
  }

  if (!leadStages.includes(stage as never)) {
    redirect(`${redirectPath}?error=Invalid%20lead%20stage`);
  }

  if (!leadStatuses.includes(status as never)) {
    redirect(`${redirectPath}?error=Invalid%20lead%20status`);
  }

  const activeProductInterests = await getLeadProductInterestOptions(supabase);
  const allowedProductInterests = new Set([
    ...activeProductInterests,
    ...existingProductInterest
  ]);
  const productInterest = formData
    .getAll("product_interest")
    .map((value) => String(value))
    .filter((value) => allowedProductInterests.has(value));

  if (productInterest.length === 0) {
    redirect(`${redirectPath}?error=At%20least%20one%20product%20interest%20is%20required`);
  }

  const lastMessageSummary = optionalText(formData.get("last_message_summary"));

  if (lastMessageSummary && lastMessageSummary.length > 200) {
    redirect(`${redirectPath}?error=Last%20message%20summary%20must%20be%20200%20characters%20or%20less`);
  }

  return {
    fullName,
    phone,
    source,
    stage,
    status,
    assignedTo,
    nextFollowupDate,
    referralSourceName,
    productInterest,
    lastMessageSummary
  };
}

export async function updateLead(formData: FormData) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();
  const leadId = optionalText(formData.get("lead_id"));

  if (!leadId) {
    redirect("/leads?error=Lead%20is%20required");
  }

  if (!hasModulePermission(currentUser, permissions, "Leads", "can_edit")) {
    redirect(`/leads/${leadId}?error=You%20do%20not%20have%20permission%20to%20edit%20leads`);
  }

  const { data: previousLead } = await supabase
    .from("leads")
    .select("notes, assigned_to, stage, status, product_interest")
    .eq("lead_id", leadId)
    .maybeSingle<{
      notes: string | null;
      assigned_to: string;
      stage: string;
      status: string;
      product_interest: string[];
    }>();
  const values = await validateLeadForm(
    supabase,
    formData,
    `/leads/${leadId}`,
    previousLead?.product_interest ?? []
  );
  const nextNotes = optionalText(formData.get("notes"));

  const { error } = await supabase
    .from("leads")
    .update({
      full_name: values.fullName,
      business_name: optionalText(formData.get("business_name")),
      phone: values.phone,
      email: optionalText(formData.get("email")),
      source: values.source,
      referral_source_name: values.referralSourceName,
      product_interest: values.productInterest,
      stage: values.stage,
      status: values.status,
      assigned_to: values.assignedTo,
      next_followup_date: values.nextFollowupDate,
      last_message_summary: values.lastMessageSummary,
      notes: nextNotes
    })
    .eq("lead_id", leadId);

  if (error) {
    redirect(`/leads/${leadId}?error=${encodeURIComponent(error.message)}`);
  }

  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const staffMembers = await activeStaffMembers(supabaseAdmin);

    if ((previousLead?.notes ?? null) !== (nextNotes ?? null)) {
      const preview =
        (nextNotes ?? "Notes cleared").length > 180
          ? `${(nextNotes ?? "Notes cleared").slice(0, 177).trim()}...`
          : nextNotes ?? "Notes cleared";
      await postLeadSlackThreadReply({
        supabaseAdmin,
        leadId,
        staffMembers,
        failureMessage: `Lead note update thread notification failed for ${leadId}`,
        message: slackFieldTable("LEAD NOTE UPDATED", [
          ["Lead ID", leadId],
          ["Updated by", currentUser.full_name],
          ["Note", preview]
        ])
      });
    }

    if (previousLead?.assigned_to && previousLead.assigned_to !== values.assignedTo) {
      await notifyLeadAssignee({
        supabaseAdmin,
        leadId,
        assignedTo: values.assignedTo,
        staffMembers,
        dedupeKey: `lead_reassigned:${leadId}:${Date.now()}`,
        message: slackFieldTable("LEAD ASSIGNED", [
          ["Lead ID", leadId],
          ["Assigned by", currentUser.full_name],
          ["Stage", values.stage],
          ["Status", values.status]
        ])
      });
    }
  } catch {
    // Slack updates should not block lead edits.
  }

  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  redirect(`/leads/${leadId}?success=Lead%20updated`);
}

export async function createLeadCommunicationLog(formData: FormData) {
  const { supabase, authUser, currentUser, permissions } =
    await getCurrentUserContext();
  const leadId = optionalText(formData.get("lead_id"));

  if (!leadId) {
    redirect("/leads?error=Lead%20is%20required");
  }

  if (!hasModulePermission(currentUser, permissions, "Leads", "can_create")) {
    redirect(`/leads/${leadId}?error=You%20do%20not%20have%20permission%20to%20log%20lead%20communications`);
  }

  const date = requiredText(formData, "date");
  const channel = requiredText(formData, "channel");
  const direction = requiredText(formData, "direction");
  const summary = requiredText(formData, "summary");

  if (!date || !channel || !direction || !summary) {
    redirect(`/leads/${leadId}?error=Date,%20channel,%20direction,%20and%20summary%20are%20required`);
  }

  if (!leadCommunicationChannels.includes(channel as never)) {
    redirect(`/leads/${leadId}?error=Invalid%20communication%20channel`);
  }

  if (!leadCommunicationDirections.includes(direction as never)) {
    redirect(`/leads/${leadId}?error=Invalid%20communication%20direction`);
  }

  const { data: log, error } = await supabase.from("lead_communication_log").insert({
    lead_id: leadId,
    date,
    channel,
    direction,
    summary,
    action_taken: optionalText(formData.get("action_taken")),
    next_step: optionalText(formData.get("next_step")),
    follow_up_date: optionalText(formData.get("follow_up_date")),
    logged_by: authUser.id
  }).select("log_id").single<{ log_id: string }>();

  if (error) {
    redirect(`/leads/${leadId}?error=${encodeURIComponent(error.message)}`);
  }

  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const [lead, staffMembers] = await Promise.all([
      tryGetLeadThreadInfo(supabaseAdmin, leadId),
      activeStaffMembers(supabaseAdmin)
    ]);
    const preview =
      summary.length > 180 ? `${summary.slice(0, 177).trim()}...` : summary;

    await postLeadSlackThreadReply({
      supabaseAdmin,
      leadId,
      staffMembers,
      failureMessage: `Lead communication thread notification failed for ${leadId}`,
      message: slackFieldTable("LEAD COMMUNICATION", [
        ["Lead ID", leadId],
        ["Logged by", currentUser.full_name],
        ["Channel", channel],
        ["Direction", direction],
        ["Summary", preview]
      ])
    });

    await notifyLeadAssignee({
      supabaseAdmin,
      leadId,
      assignedTo: lead?.assigned_to ?? null,
      staffMembers,
      dedupeKey: `lead_communication_assignee:${log?.log_id}:${lead?.assigned_to ?? "none"}`,
      message: slackFieldTable("LEAD COMMUNICATION", [
        ["Lead ID", leadId],
        ["Logged by", currentUser.full_name],
        ["Channel", channel],
        ["Summary", preview]
      ])
    });
  } catch {
    // Slack updates should not block communication logging.
  }

  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  redirect(`/leads/${leadId}?success=Communication%20logged`);
}

export async function updateLeadStageAndStatus(formData: FormData) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();
  const leadId = optionalText(formData.get("lead_id"));
  const stage = optionalText(formData.get("stage"));
  const status = optionalText(formData.get("status"));
  const returnTo = optionalText(formData.get("return_to")) ?? "/leads";

  if (!leadId || !stage || !status) {
    redirect(`${returnTo}?error=Lead,%20stage,%20and%20status%20are%20required`);
  }

  if (!hasModulePermission(currentUser, permissions, "Leads", "can_edit")) {
    redirect(`${returnTo}?error=You%20do%20not%20have%20permission%20to%20edit%20leads`);
  }

  if (!leadStages.includes(stage as never)) {
    redirect(`${returnTo}?error=Invalid%20lead%20stage`);
  }

  if (!leadStatuses.includes(status as never)) {
    redirect(`${returnTo}?error=Invalid%20lead%20status`);
  }

  const { data: previousLead } = await supabase
    .from("leads")
    .select("stage, status, assigned_to, full_name")
    .eq("lead_id", leadId)
    .maybeSingle<{
      stage: string;
      status: string;
      assigned_to: string;
      full_name: string;
    }>();

  const { error } = await supabase
    .from("leads")
    .update({
      stage,
      status,
      converted: status === "Closed Won" || stage === "Converted"
    })
    .eq("lead_id", leadId);

  if (error) {
    redirect(`${returnTo}?error=${encodeURIComponent(error.message)}`);
  }

  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const staffMembers = await activeStaffMembers(supabaseAdmin);
    const previousState = previousLead
      ? `${previousLead.stage} / ${previousLead.status}`
      : "Previous state unknown";
    const nextState = `${stage} / ${status}`;
    const message = slackFieldTable("LEAD STAGE/STATUS CHANGED", [
      ["Lead ID", leadId],
      ["Changed by", currentUser.full_name],
      ["Previous", previousState],
      ["Current", nextState]
    ]);

    await postLeadSlackThreadReply({
      supabaseAdmin,
      leadId,
      staffMembers,
      failureMessage: `Lead stage/status thread notification failed for ${leadId}`,
      message
    });

    await notifyLeadAssignee({
      supabaseAdmin,
      leadId,
      assignedTo: previousLead?.assigned_to ?? null,
      staffMembers,
      dedupeKey: `lead_stage_status_assignee:${leadId}:${Date.now()}`,
      message: slackFieldTable("LEAD UPDATED", [
        ["Lead ID", leadId],
        ["Lead name", previousLead?.full_name ?? "Unknown lead"],
        ["Updated by", currentUser.full_name],
        ["Previous", previousState],
        ["Current", nextState]
      ])
    });
  } catch {
    // Slack updates should not block stage/status changes.
  }

  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath("/leads/pipeline");
  revalidatePath("/leads/attention");
  revalidatePath(`/leads/${leadId}`);
  redirect(`${returnTo}?success=Lead%20updated`);
}

export async function linkLeadToBusiness(formData: FormData) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();
  const leadId = optionalText(formData.get("lead_id"));
  const businessId = optionalText(formData.get("business_id"));

  if (!leadId || !businessId) {
    redirect("/leads?error=Lead%20and%20business%20are%20required");
  }

  if (!hasModulePermission(currentUser, permissions, "Leads", "can_edit")) {
    redirect(`/leads/${leadId}?error=You%20do%20not%20have%20permission%20to%20link%20leads`);
  }

  if (!hasModulePermission(currentUser, permissions, "Businesses", "can_view")) {
    redirect(`/leads/${leadId}?error=You%20need%20Business%20view%20permission%20to%20link%20a%20lead`);
  }

  const [{ data: lead }, { data: business }] = await Promise.all([
    supabase
      .from("leads")
      .select("lead_id, assigned_to")
      .eq("lead_id", leadId)
      .single<{ lead_id: string; assigned_to: string }>(),
    supabase
      .from("businesses")
      .select("business_id, business_name")
      .eq("business_id", businessId)
      .single<{ business_id: string; business_name: string }>()
  ]);

  if (!lead) {
    redirect(`/leads/${leadId}?error=Lead%20not%20found`);
  }

  if (!business) {
    redirect(`/leads/${leadId}?error=Business%20not%20found`);
  }

  const { error } = await supabase
    .from("leads")
    .update({
      converted: true,
      stage: "Converted",
      status: "Closed Won",
      linked_business_id: businessId
    })
    .eq("lead_id", leadId);

  if (error) {
    redirect(`/leads/${leadId}?error=${encodeURIComponent(error.message)}`);
  }

  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const staffMembers = await activeStaffMembers(supabaseAdmin);
    const message = slackFieldTable("LEAD LINKED TO BUSINESS", [
      ["Lead ID", leadId],
      ["Business ID", business.business_id],
      ["Business Name", business.business_name],
      ["Linked by", currentUser.full_name],
      ["Stage", "Converted"],
      ["Status", "Closed Won"]
    ]);

    await postLeadSlackThreadReply({
      supabaseAdmin,
      leadId,
      staffMembers,
      failureMessage: `Lead business linking thread notification failed for ${leadId}`,
      message
    });

    await notifyLeadAssignee({
      supabaseAdmin,
      leadId,
      assignedTo: lead.assigned_to,
      staffMembers,
      dedupeKey: `lead_linked_business_assignee:${leadId}:${businessId}`,
      message: slackFieldTable("LEAD LINKED TO BUSINESS", [
        ["Lead ID", leadId],
        ["Business ID", business.business_id],
        ["Business Name", business.business_name],
        ["Linked by", currentUser.full_name]
      ])
    });
  } catch {
    // Slack updates should not block business linking.
  }

  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath("/leads/pipeline");
  revalidatePath("/businesses");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath(`/businesses/${businessId}`);
  redirect(`/leads/${leadId}?success=Lead%20linked%20to%20registered%20business`);
}

export async function bulkUploadLeads(formData: FormData) {
  const { currentUser, permissions } = await getCurrentUserContext();

  if (!hasModulePermission(currentUser, permissions, "Leads", "can_create")) {
    redirect("/leads?error=You%20do%20not%20have%20permission%20to%20create%20leads");
  }

  const file = formData.get("csv_file");

  if (!(file instanceof File) || file.size === 0) {
    redirect("/leads?error=Please%20upload%20a%20CSV%20file");
  }

  const rows = parseCsv(await file.text());
  const [headers, ...bodyRows] = rows;

  if (!headers || bodyRows.length === 0) {
    redirect("/leads?error=CSV%20must%20include%20a%20header%20and%20at%20least%20one%20row");
  }

  const headerMap = headers.map(normalizeHeader);
  const records = [];
  let skipped = 0;

  // Pre-resolve all unique staff emails in one query
  const supabaseAdmin = createSupabaseAdminClient();
  const rawEmails = bodyRows
    .map((row) => row[headerMap.indexOf("assigned_to_email")]?.trim().toLowerCase())
    .filter(Boolean) as string[];
  const uniqueEmails = [...new Set(rawEmails)];

  let staffEmailMap: Record<string, string> = {};
  if (uniqueEmails.length > 0) {
    const { data: staffRows } = await supabaseAdmin
      .from("users")
      .select("user_id, email")
      .in("email", uniqueEmails)
      .returns<Array<{ user_id: string; email: string }>>();
    staffEmailMap = Object.fromEntries(
      (staffRows ?? []).map((s) => [s.email.toLowerCase(), s.user_id])
    );
  }

  for (const row of bodyRows) {
    const get = (key: string) => row[headerMap.indexOf(key)]?.trim() || null;
    const fullName = get("full_name");
    const phone = get("phone");

    if (!fullName || !phone) {
      skipped += 1;
      continue;
    }

    const assignedToEmail = get("assigned_to_email")?.toLowerCase() ?? null;
    const assignedTo = assignedToEmail ? (staffEmailMap[assignedToEmail] ?? null) : null;

    const stage = leadStages.includes(get("stage") as LeadStage)
      ? (get("stage") as LeadStage)
      : "New";
    const status = leadStatuses.includes(get("status") as LeadStatus)
      ? (get("status") as LeadStatus)
      : "Cold";
    const source = leadSources.includes(get("source") as typeof leadSources[number])
      ? (get("source") as typeof leadSources[number])
      : null;

    const nextFollowupDate = get("next_followup_date") ?? null;

    records.push({
      full_name: fullName,
      business_name: get("business_name"),
      phone,
      email: get("email")?.toLowerCase() ?? null,
      source,
      referral_source_name: get("referral_source_name"),
      product_interest: get("product_interest"),
      stage,
      status,
      assigned_to: assignedTo,
      next_followup_date: nextFollowupDate,
      last_message_summary: get("last_message_summary"),
      notes: get("notes")
    });
  }

  if (records.length === 0) {
    redirect("/leads?error=No%20valid%20lead%20rows%20found%20(full_name%20and%20phone%20are%20required)");
  }

  const { error } = await supabaseAdmin.from("leads").insert(records);

  if (error) {
    redirect(`/leads?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/leads");
  revalidatePath("/leads/pipeline");
  revalidatePath("/leads/attention");
  redirect(
    `/leads?success=${records.length}%20lead(s)%20imported,%20${skipped}%20skipped`
  );
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(current.trim());
      current = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(current.trim());
      if (row.some(Boolean)) {
        rows.push(row);
      }
      current = "";
      row = [];
    } else {
      current += char;
    }
  }

  row.push(current.trim());
  if (row.some(Boolean)) {
    rows.push(row);
  }

  return rows;
}

function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/\s+/g, "_");
}

export async function deleteLead(formData: FormData) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();
  const leadId = optionalText(formData.get("lead_id"));

  if (!leadId) {
    redirect("/leads?error=Lead%20is%20required");
  }

  if (!hasModulePermission(currentUser, permissions, "Leads", "can_delete")) {
    redirect(`/leads/${leadId}?error=You%20do%20not%20have%20permission%20to%20delete%20leads`);
  }

  const { error } = await supabase.from("leads").delete().eq("lead_id", leadId);

  if (error) {
    redirect(`/leads/${leadId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath("/leads/pipeline");
  revalidatePath("/leads/attention");
  redirect("/leads?success=Lead%20deleted");
}
