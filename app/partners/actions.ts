"use server";

import { getCurrentUserContext } from "@/lib/auth/current-user";
import { deliverSlackEventsImmediately } from "@/lib/notifications/automation-delivery";
import { sendSlackChannelMessage } from "@/lib/notifications/slack";
import {
  slackFieldTable,
  withSlackMentions
} from "@/lib/notifications/ticket-messages";
import {
  partnerCommunicationChannels,
  partnerCommunicationDirections,
  partnerOutreachStatuses,
  partnerPriorities,
  partnerTags,
  partnerTypes,
  statusesRequiringOutcome
} from "@/lib/constants/partners";
import { hasModulePermission } from "@/lib/permissions/checks";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { NewAutomationEvent } from "@/lib/types/automation-events";
import type { PartnerTag } from "@/lib/types/partners";
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

type PartnerThreadInfo = {
  partner_id: string;
  organisation_name: string;
  partner_type: string;
  custom_partner_type: string | null;
  country: string | null;
  payscribe_contact: string | null;
  outreach_status: string;
  priority: string | null;
  outcome_reason: string | null;
  next_review_date: string | null;
  would_revisit: boolean;
  notes: string | null;
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

async function tryGetPartnerThreadInfo(
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>,
  partnerId: string
) {
  const { data } = await supabaseAdmin
    .from("partners")
    .select(
      "partner_id, organisation_name, partner_type, custom_partner_type, country, payscribe_contact, outreach_status, priority, outcome_reason, next_review_date, would_revisit, notes, slack_channel_id, slack_thread_ts"
    )
    .eq("partner_id", partnerId)
    .maybeSingle<PartnerThreadInfo>();

  return data;
}

async function ensurePartnerSlackThread({
  supabaseAdmin,
  partner,
  staffMembers
}: {
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>;
  partner: PartnerThreadInfo;
  staffMembers: StaffUser[];
}) {
  const token = process.env.SLACK_BOT_TOKEN;
  const channelId = process.env.SLACK_CRM_TICKETS_CHANNEL_ID;

  if (!token || !channelId) {
    return null;
  }

  if (partner.slack_thread_ts && partner.slack_channel_id) {
    return {
      channelId: partner.slack_channel_id,
      threadTs: partner.slack_thread_ts
    };
  }

  const owner = partner.payscribe_contact
    ? staffMembers.find(
        (staffMember) => staffMember.user_id === partner.payscribe_contact
      )
    : null;
  const displayType =
    partner.partner_type === "Other" && partner.custom_partner_type
      ? partner.custom_partner_type
      : partner.partner_type;
  const message = withSlackMentions(slackFieldTable("NEW PARTNER", [
    ["Partner ID", partner.partner_id],
    ["Organisation", partner.organisation_name],
    ["Type", displayType],
    ["Country", partner.country],
    ["Status", partner.outreach_status],
    ["Priority", partner.priority],
    ["Owned by", owner?.full_name ?? "Unassigned"]
  ]), [owner?.slack_user_id]);
  const posted = await sendSlackChannelMessage({
    channelId,
    message,
    module: "Partners",
    recordId: partner.partner_id,
    token
  });

  await supabaseAdmin
    .from("partners")
    .update({
      slack_channel_id: posted.channelId,
      slack_thread_ts: posted.ts
    })
    .eq("partner_id", partner.partner_id);

  return {
    channelId: posted.channelId,
    threadTs: posted.ts
  };
}

async function logPartnerSlackChannelFailure({
  supabaseAdmin,
  partnerId,
  message,
  error
}: {
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>;
  partnerId: string;
  message: string;
  error: unknown;
}) {
  await supabaseAdmin.from("automation_events").upsert(
    {
      rule_key: "partner_channel_thread_notification",
      module: "Partners",
      record_id: partnerId,
      target_user_id: null,
      target_channel: "crm_tickets",
      message,
      status: "Failed",
      dedupe_key: `partner_channel_thread_notification:${partnerId}:${Date.now()}`,
      payload: {
        partner_id: partnerId
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

async function postPartnerSlackThreadReply({
  supabaseAdmin,
  partnerId,
  message,
  failureMessage,
  staffMembers
}: {
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>;
  partnerId: string;
  message: string;
  failureMessage: string;
  staffMembers: StaffUser[];
}) {
  const token = process.env.SLACK_BOT_TOKEN;

  if (!token) {
    return;
  }

  try {
    const partner = await tryGetPartnerThreadInfo(supabaseAdmin, partnerId);

    if (!partner) {
      return;
    }

    const thread = await ensurePartnerSlackThread({
      supabaseAdmin,
      partner,
      staffMembers
    });

    if (!thread) {
      return;
    }

    await sendSlackChannelMessage({
      channelId: thread.channelId,
      message,
      module: "Partners",
      recordId: partnerId,
      threadTs: thread.threadTs,
      token
    });
  } catch (error) {
    await logPartnerSlackChannelFailure({
      supabaseAdmin,
      partnerId,
      message: failureMessage,
      error
    });
  }
}

async function notifyPartnerOwner({
  supabaseAdmin,
  partnerId,
  ownerUserId,
  message,
  dedupeKey,
  staffMembers
}: {
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>;
  partnerId: string;
  ownerUserId: string | null;
  message: string;
  dedupeKey: string;
  staffMembers: StaffUser[];
}) {
  if (!ownerUserId) {
    return;
  }

  const events: NewAutomationEvent[] = [
    {
      rule_key: "partner_owner_notification",
      module: "Partners",
      record_id: partnerId,
      target_user_id: ownerUserId,
      target_channel: "slack_dm",
      message,
      dedupe_key: dedupeKey,
      payload: {
        partner_id: partnerId
      }
    }
  ];

  await deliverSlackEventsImmediately({
    supabase: supabaseAdmin,
    events,
    staffMembers
  });
}

function validatePartnerForm(formData: FormData, redirectPath: string) {
  const organisationName = requiredText(formData, "organisation_name");
  const partnerType = requiredText(formData, "partner_type");
  const customPartnerType = optionalText(formData.get("custom_partner_type"));
  const outreachStatus = requiredText(formData, "outreach_status") ?? "Identified";
  const priority = optionalText(formData.get("priority"));
  const outcomeReason = optionalText(formData.get("outcome_reason"));
  const wouldRevisit = formData.get("would_revisit") === "on";
  const nextReviewDate = optionalText(formData.get("next_review_date"));
  const tags = formData
    .getAll("tags")
    .map((value) => String(value))
    .filter((value): value is PartnerTag =>
      partnerTags.includes(value as PartnerTag)
    );

  if (!organisationName || !partnerType) {
    redirect(`${redirectPath}?error=Organisation%20name%20and%20partner%20type%20are%20required`);
  }

  if (!partnerTypes.includes(partnerType as never)) {
    redirect(`${redirectPath}?error=Invalid%20partner%20type`);
  }

  if (partnerType === "Other" && !customPartnerType) {
    redirect(`${redirectPath}?error=Specify%20partner%20type%20is%20required%20when%20Partner%20type%20is%20Other`);
  }

  if (!partnerOutreachStatuses.includes(outreachStatus as never)) {
    redirect(`${redirectPath}?error=Invalid%20outreach%20status`);
  }

  if (priority && !partnerPriorities.includes(priority as never)) {
    redirect(`${redirectPath}?error=Invalid%20priority`);
  }

  if (statusesRequiringOutcome.includes(outreachStatus as never) && !outcomeReason) {
    redirect(`${redirectPath}?error=Outcome%20reason%20is%20required%20for%20this%20status`);
  }

  if (wouldRevisit && !nextReviewDate) {
    redirect(`${redirectPath}?error=Next%20review%20date%20is%20required%20when%20Would%20revisit%20is%20enabled`);
  }

  return {
    organisationName,
    partnerType,
    customPartnerType: partnerType === "Other" ? customPartnerType : null,
    outreachStatus,
    priority,
    outcomeReason,
    wouldRevisit,
    nextReviewDate,
    tags
  };
}

export async function createPartner(formData: FormData) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();

  if (!hasModulePermission(currentUser, permissions, "Partners", "can_create")) {
    redirect("/partners?error=You%20do%20not%20have%20permission%20to%20create%20partners");
  }

  const values = validatePartnerForm(formData, "/partners");

  const { data: createdPartner, error } = await supabase
    .from("partners")
    .insert({
      organisation_name: values.organisationName,
      website: optionalText(formData.get("website")),
      country: optionalText(formData.get("country")),
      partner_type: values.partnerType,
      custom_partner_type: values.customPartnerType,
      service_description: optionalText(formData.get("service_description")),
      reason_for_outreach: optionalText(formData.get("reason_for_outreach")),
      payscribe_contact: optionalText(formData.get("payscribe_contact")),
      their_contact_name: optionalText(formData.get("their_contact_name")),
      their_contact_title: optionalText(formData.get("their_contact_title")),
      their_contact_email: optionalText(formData.get("their_contact_email")),
      their_contact_phone: optionalText(formData.get("their_contact_phone")),
      outreach_status: values.outreachStatus,
      outcome_reason: values.outcomeReason,
      next_review_date: values.nextReviewDate,
      would_revisit: values.wouldRevisit,
      priority: values.priority,
      tags: values.tags,
      notes: optionalText(formData.get("notes"))
    })
    .select("partner_id")
    .single<{ partner_id: string }>();

  if (error) {
    redirect(`/partners?error=${encodeURIComponent(error.message)}`);
  }

  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const [partner, staffMembers] = await Promise.all([
      tryGetPartnerThreadInfo(supabaseAdmin, createdPartner.partner_id),
      activeStaffMembers(supabaseAdmin)
    ]);

    if (partner) {
      await ensurePartnerSlackThread({
        supabaseAdmin,
        partner,
        staffMembers
      });
      await notifyPartnerOwner({
        supabaseAdmin,
        partnerId: partner.partner_id,
        ownerUserId: partner.payscribe_contact,
        staffMembers,
        dedupeKey: `partner_created_owner:${partner.partner_id}`,
        message: slackFieldTable("PARTNER ASSIGNED", [
          ["Partner ID", partner.partner_id],
          ["Organisation", partner.organisation_name],
          ["Status", partner.outreach_status],
          ["Priority", partner.priority]
        ])
      });
    }
  } catch (slackError) {
    const supabaseAdmin = createSupabaseAdminClient();
    await logPartnerSlackChannelFailure({
      supabaseAdmin,
      partnerId: createdPartner.partner_id,
      message: `Partner channel notification failed for ${createdPartner.partner_id}`,
      error: slackError
    });
  }

  revalidatePath("/");
  revalidatePath("/partners");
  redirect(`/partners?success=Partner%20${createdPartner.partner_id}%20created`);
}

export async function updatePartner(formData: FormData) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();
  const partnerId = optionalText(formData.get("partner_id"));

  if (!partnerId) {
    redirect("/partners?error=Partner%20is%20required");
  }

  if (!hasModulePermission(currentUser, permissions, "Partners", "can_edit")) {
    redirect(`/partners/${partnerId}?error=You%20do%20not%20have%20permission%20to%20edit%20partners`);
  }

  const values = validatePartnerForm(formData, `/partners/${partnerId}`);
  const { data: previousPartner } = await supabase
    .from("partners")
    .select("payscribe_contact, outreach_status, priority, notes, organisation_name")
    .eq("partner_id", partnerId)
    .maybeSingle<{
      payscribe_contact: string | null;
      outreach_status: string;
      priority: string | null;
      notes: string | null;
      organisation_name: string;
    }>();
  const nextNotes = optionalText(formData.get("notes"));
  const nextOwner = optionalText(formData.get("payscribe_contact"));

  const { error } = await supabase
    .from("partners")
    .update({
      organisation_name: values.organisationName,
      website: optionalText(formData.get("website")),
      country: optionalText(formData.get("country")),
      partner_type: values.partnerType,
      custom_partner_type: values.customPartnerType,
      service_description: optionalText(formData.get("service_description")),
      reason_for_outreach: optionalText(formData.get("reason_for_outreach")),
      payscribe_contact: optionalText(formData.get("payscribe_contact")),
      their_contact_name: optionalText(formData.get("their_contact_name")),
      their_contact_title: optionalText(formData.get("their_contact_title")),
      their_contact_email: optionalText(formData.get("their_contact_email")),
      their_contact_phone: optionalText(formData.get("their_contact_phone")),
      outreach_status: values.outreachStatus,
      outcome_reason: values.outcomeReason,
      next_review_date: values.nextReviewDate,
      would_revisit: values.wouldRevisit,
      priority: values.priority,
      tags: values.tags,
      notes: nextNotes
    })
    .eq("partner_id", partnerId);

  if (error) {
    redirect(`/partners/${partnerId}?error=${encodeURIComponent(error.message)}`);
  }

  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const staffMembers = await activeStaffMembers(supabaseAdmin);
    const changes: string[] = [];

    if (
      previousPartner &&
      previousPartner.outreach_status !== values.outreachStatus
    ) {
      changes.push(
        `Status: ${previousPartner.outreach_status} -> ${values.outreachStatus}`
      );
    }

    if ((previousPartner?.priority ?? null) !== (values.priority ?? null)) {
      changes.push(
        `Priority: ${previousPartner?.priority ?? "Not set"} -> ${values.priority ?? "Not set"}`
      );
    }

    if ((previousPartner?.notes ?? null) !== (nextNotes ?? null)) {
      const preview =
        (nextNotes ?? "Notes cleared").length > 160
          ? `${(nextNotes ?? "Notes cleared").slice(0, 157).trim()}...`
          : nextNotes ?? "Notes cleared";
      changes.push(`Notes updated: ${preview}`);
    }

    if (changes.length > 0) {
      await postPartnerSlackThreadReply({
        supabaseAdmin,
        partnerId,
        staffMembers,
        failureMessage: `Partner update thread notification failed for ${partnerId}`,
        message: slackFieldTable("PARTNER UPDATED", [
          ["Partner ID", partnerId],
          ["Updated by", currentUser.full_name],
          ["Changes", changes.join(" | ")]
        ])
      });
    }

    if ((previousPartner?.payscribe_contact ?? null) !== (nextOwner ?? null)) {
      await notifyPartnerOwner({
        supabaseAdmin,
        partnerId,
        ownerUserId: nextOwner,
        staffMembers,
        dedupeKey: `partner_reassigned:${partnerId}:${Date.now()}`,
        message: slackFieldTable("PARTNER ASSIGNED", [
          ["Partner ID", partnerId],
          ["Organisation", previousPartner?.organisation_name ?? values.organisationName],
          ["Assigned by", currentUser.full_name],
          ["Status", values.outreachStatus]
        ])
      });
    }
  } catch {
    // Slack updates should not block partner edits.
  }

  revalidatePath("/");
  revalidatePath("/partners");
  revalidatePath(`/partners/${partnerId}`);
  redirect(`/partners/${partnerId}?success=Partner%20updated`);
}

export async function createPartnerCommunicationLog(formData: FormData) {
  const { supabase, authUser, currentUser, permissions } =
    await getCurrentUserContext();
  const partnerId = optionalText(formData.get("partner_id"));

  if (!partnerId) {
    redirect("/partners?error=Partner%20is%20required");
  }

  if (!hasModulePermission(currentUser, permissions, "Partners", "can_create")) {
    redirect(`/partners/${partnerId}?error=You%20do%20not%20have%20permission%20to%20log%20partner%20communications`);
  }

  const date = requiredText(formData, "date");
  const channel = requiredText(formData, "channel");
  const direction = requiredText(formData, "direction");
  const summary = requiredText(formData, "summary");

  if (!date || !channel || !direction || !summary) {
    redirect(`/partners/${partnerId}?error=Date,%20channel,%20direction,%20and%20summary%20are%20required`);
  }

  if (!partnerCommunicationChannels.includes(channel as never)) {
    redirect(`/partners/${partnerId}?error=Invalid%20communication%20channel`);
  }

  if (!partnerCommunicationDirections.includes(direction as never)) {
    redirect(`/partners/${partnerId}?error=Invalid%20communication%20direction`);
  }

  const { data: log, error } = await supabase.from("partner_communication_log").insert({
    partner_id: partnerId,
    date,
    channel,
    direction,
    participants_payscribe: optionalText(formData.get("participants_payscribe")),
    participants_partner: optionalText(formData.get("participants_partner")),
    summary,
    outcome: optionalText(formData.get("outcome")),
    next_step: optionalText(formData.get("next_step")),
    follow_up_date: optionalText(formData.get("follow_up_date")),
    logged_by: authUser.id
  }).select("log_id").single<{ log_id: string }>();

  if (error) {
    redirect(`/partners/${partnerId}?error=${encodeURIComponent(error.message)}`);
  }

  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const [partner, staffMembers] = await Promise.all([
      tryGetPartnerThreadInfo(supabaseAdmin, partnerId),
      activeStaffMembers(supabaseAdmin)
    ]);
    const preview =
      summary.length > 180 ? `${summary.slice(0, 177).trim()}...` : summary;

    await postPartnerSlackThreadReply({
      supabaseAdmin,
      partnerId,
      staffMembers,
      failureMessage: `Partner communication thread notification failed for ${partnerId}`,
      message: slackFieldTable("PARTNER COMMUNICATION", [
        ["Partner ID", partnerId],
        ["Logged by", currentUser.full_name],
        ["Channel", channel],
        ["Direction", direction],
        ["Summary", preview]
      ])
    });

    await notifyPartnerOwner({
      supabaseAdmin,
      partnerId,
      ownerUserId: partner?.payscribe_contact ?? null,
      staffMembers,
      dedupeKey: `partner_communication_owner:${log?.log_id}:${partner?.payscribe_contact ?? "none"}`,
      message: slackFieldTable("PARTNER COMMUNICATION", [
        ["Partner ID", partnerId],
        ["Logged by", currentUser.full_name],
        ["Channel", channel],
        ["Summary", preview]
      ])
    });
  } catch {
    // Slack updates should not block communication logging.
  }

  revalidatePath("/");
  revalidatePath("/partners");
  revalidatePath(`/partners/${partnerId}`);
  redirect(`/partners/${partnerId}?success=Communication%20logged`);
}
