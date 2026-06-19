import {
  sendSlackChannelMessage,
  sendSlackDirectMessage,
  sendSlackWebhookMessage
} from "@/lib/notifications/slack";
import type {
  AutomationEvent,
  NewAutomationEvent
} from "@/lib/types/automation-events";
import type { StaffUser } from "@/lib/types/users";
import type { SupabaseClient } from "@supabase/supabase-js";

type DeliveryEvent = NewAutomationEvent | AutomationEvent;

type DeliveryResult = {
  skippedCount: number;
  sentCount: number;
  failedCount: number;
};

function webhookForChannel(targetChannel: string | null) {
  const webhookByChannel = new Map([
    ["crm_tickets", process.env.SLACK_CRM_TICKETS_WEBHOOK_URL],
    ["crm_leads", process.env.SLACK_CRM_LEADS_WEBHOOK_URL],
    ["crm_general", process.env.SLACK_CRM_GENERAL_WEBHOOK_URL]
  ]);

  return targetChannel ? webhookByChannel.get(targetChannel) : null;
}

async function sendSlackEvent(
  event: DeliveryEvent,
  staffById: Map<string, StaffUser>
) {
  if (event.target_channel === "slack_dm") {
    const token = process.env.SLACK_BOT_TOKEN;

    if (!token) {
      throw new Error("SLACK_BOT_TOKEN is not configured.");
    }

    const targetUser = event.target_user_id
      ? staffById.get(event.target_user_id)
      : null;

    if (!targetUser?.slack_user_id) {
      throw new Error("Target staff member has no Slack user ID.");
    }

    await sendSlackDirectMessage({
      slackUserId: targetUser.slack_user_id,
      message: event.message,
      module: event.module,
      recordId: event.record_id,
      token
    });

    return;
  }

  const token = process.env.SLACK_BOT_TOKEN;
  const channelId = process.env.SLACK_CRM_TICKETS_CHANNEL_ID;

  if (token && channelId) {
    await sendSlackChannelMessage({
      channelId,
      message: event.message,
      module: event.module,
      recordId: event.record_id,
      token
    });

    return;
  }

  const webhookUrl = webhookForChannel(event.target_channel);

  if (!webhookUrl) {
    throw new Error(
      `Webhook URL is not configured for ${event.target_channel ?? "unknown channel"}.`
    );
  }

  await sendSlackWebhookMessage({
    webhookUrl,
    message: event.message,
    module: event.module,
    recordId: event.record_id
  });
}

async function recordDeliveryStatus({
  supabase,
  event,
  status,
  errorMessage
}: {
  supabase: SupabaseClient;
  event: DeliveryEvent;
  status: "Sent" | "Failed";
  errorMessage: string | null;
}) {
  const processedAt = new Date().toISOString();

  if ("event_id" in event) {
    await supabase
      .from("automation_events")
      .update({
        status,
        processed_at: processedAt,
        error_message: errorMessage
      })
      .eq("event_id", event.event_id);
    return;
  }

  await supabase.from("automation_events").upsert(
    {
      ...event,
      status,
      processed_at: processedAt,
      error_message: errorMessage
    },
    {
      onConflict: "dedupe_key"
    }
  );
}

async function hasAlreadyBeenSent({
  supabase,
  event
}: {
  supabase: SupabaseClient;
  event: DeliveryEvent;
}) {
  if ("event_id" in event) {
    return false;
  }

  const { data } = await supabase
    .from("automation_events")
    .select("status")
    .eq("dedupe_key", event.dedupe_key)
    .maybeSingle<{ status: string }>();

  return data?.status === "Sent";
}

export async function deliverSlackEventsImmediately({
  supabase,
  events,
  staffMembers
}: {
  supabase: SupabaseClient;
  events: DeliveryEvent[];
  staffMembers: StaffUser[];
}): Promise<DeliveryResult> {
  const staffById = new Map(
    staffMembers.map((staffMember) => [staffMember.user_id, staffMember])
  );
  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const event of events) {
    try {
      if (await hasAlreadyBeenSent({ supabase, event })) {
        skippedCount += 1;
        continue;
      }

      await sendSlackEvent(event, staffById);
      sentCount += 1;
      await recordDeliveryStatus({
        supabase,
        event,
        status: "Sent",
        errorMessage: null
      });
    } catch (error) {
      failedCount += 1;
      await recordDeliveryStatus({
        supabase,
        event,
        status: "Failed",
        errorMessage:
          error instanceof Error ? error.message : "Slack delivery failed."
      });
    }
  }

  return { sentCount, failedCount, skippedCount };
}
