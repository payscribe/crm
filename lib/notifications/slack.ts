import {
  formatSlackNotificationText,
  notificationStyleForModule
} from "@/lib/notifications/module-styles";

type SlackResponse = {
  ok: boolean;
  error?: string;
  channel?:
    | string
    | {
        id?: string;
      };
  ts?: string;
};

async function callSlackApi(
  endpoint: string,
  body: Record<string, unknown>,
  token: string
) {
  const response = await fetch(`https://slack.com/api/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const data = (await response.json()) as SlackResponse;

  if (!response.ok || !data.ok) {
    throw new Error(data.error ?? `Slack API request failed: ${endpoint}`);
  }

  return data;
}

export async function sendSlackDirectMessage({
  slackUserId,
  message,
  module,
  recordId,
  token
}: {
  slackUserId: string;
  message: string;
  module?: string | null;
  recordId?: string | null;
  token: string;
}) {
  const cleanSlackUserId = slackUserId.trim();

  if (!cleanSlackUserId) {
    throw new Error("Slack user ID is empty.");
  }

  const conversation = await callSlackApi(
    "conversations.open",
    {
      users: cleanSlackUserId
    },
    token
  );

  const channelId =
    typeof conversation.channel === "string"
      ? conversation.channel
      : conversation.channel?.id;

  if (!channelId) {
    throw new Error("Slack did not return a DM channel.");
  }

  await callSlackApi(
    "chat.postMessage",
    {
      channel: channelId,
      ...slackMessagePayload({
        message,
        module,
        recordId
      })
    },
    token
  );
}

export async function sendSlackChannelMessage({
  channelId,
  message,
  module,
  recordId,
  threadTs,
  token
}: {
  channelId: string;
  message: string;
  module?: string | null;
  recordId?: string | null;
  threadTs?: string | null;
  token: string;
}) {
  const response = await callSlackApi(
    "chat.postMessage",
    {
      channel: channelId,
      ...slackMessagePayload({
        message,
        module,
        recordId
      }),
      ...(threadTs ? { thread_ts: threadTs } : {})
    },
    token
  );

  if (!response.ts) {
    throw new Error("Slack did not return a message timestamp.");
  }

  return {
    channelId:
      typeof response.channel === "string"
        ? response.channel
        : response.channel?.id ?? channelId,
    ts: response.ts
  };
}

export async function sendSlackWebhookMessage({
  webhookUrl,
  message,
  module,
  recordId
}: {
  webhookUrl: string;
  message: string;
  module?: string | null;
  recordId?: string | null;
}) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(
      slackMessagePayload({
        message,
        module,
        recordId
      })
    )
  });

  const responseText = await response.text();

  if (!response.ok || responseText.trim().toLowerCase() !== "ok") {
    throw new Error(
      responseText || `Slack webhook request failed with status ${response.status}`
    );
  }
}

function slackMessagePayload({
  message,
  module,
  recordId
}: {
  message: string;
  module?: string | null;
  recordId?: string | null;
}) {
  const text = module
    ? formatSlackNotificationText({ module, message, recordId })
    : message;
  const style = notificationStyleForModule(module);

  if (!module) {
    return { text };
  }

  return {
    text,
    attachments: [
      {
        color: style.color,
        text,
        mrkdwn_in: ["text"]
      }
    ]
  };
}
