import { sendSlackChannelMessage } from "@/lib/notifications/slack";
import {
  slackFieldTable,
  withSlackMentions
} from "@/lib/notifications/ticket-messages";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { StaffUser } from "@/lib/types/users";

export type LeadThreadInfo = {
  lead_id: string;
  full_name: string;
  business_name: string | null;
  source: string;
  product_interest: string[];
  stage: string;
  status: string;
  assigned_to: string;
  next_followup_date: string | null;
  notes: string | null;
  linked_business_id: string | null;
  slack_channel_id?: string | null;
  slack_thread_ts?: string | null;
};

export async function activeStaffMembers(
  supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>
) {
  const { data } = await supabaseAdmin
    .from("users")
    .select("*")
    .eq("status", "Active")
    .returns<StaffUser[]>();

  return data ?? [];
}

export async function tryGetLeadThreadInfo(
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

export async function ensureLeadSlackThread({
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

export async function logLeadSlackChannelFailure({
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

export async function postLeadSlackThreadReply({
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
