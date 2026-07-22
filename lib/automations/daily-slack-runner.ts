import { buildBusinessAutomationEvents } from "@/lib/automations/business-events";
import { buildLeadAutomationEvents } from "@/lib/automations/lead-events";
import { buildPartnerAutomationEvents } from "@/lib/automations/partner-events";
import { buildProductEventAutomationEvents } from "@/lib/automations/product-event-events";
import { buildTaskAutomationEvents } from "@/lib/automations/task-events";
import { buildTicketAutomationEvents } from "@/lib/automations/ticket-events";
import { defaultAutomationSettings } from "@/lib/constants/automation-settings";
import { deliverSlackEventsImmediately } from "@/lib/notifications/automation-delivery";
import { sendSlackChannelMessage } from "@/lib/notifications/slack";
import {
  slackFieldTable,
  ticketOpenedSlackMessage
} from "@/lib/notifications/ticket-messages";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { NewAutomationEvent } from "@/lib/types/automation-events";
import type { AutomationSettings } from "@/lib/types/automation-settings";
import type { Business } from "@/lib/types/businesses";
import type { Lead } from "@/lib/types/leads";
import type { Partner } from "@/lib/types/partners";
import type { ProductEvent } from "@/lib/types/product-events";
import type { Task } from "@/lib/types/tasks";
import type { Ticket } from "@/lib/types/tickets";
import type { StaffUser } from "@/lib/types/users";

type ThreadReplyResult = {
  failedCount: number;
  sentCount: number;
  skippedCount: number;
};

type LeadThreadRecord = {
  lead_id: string;
  full_name: string;
  business_name: string | null;
  source: string;
  product_interest: string[];
  stage: string;
  status: string;
  assigned_to: string;
  next_followup_date: string;
  slack_channel_id: string | null;
  slack_thread_ts: string | null;
};

type PartnerThreadRecord = {
  partner_id: string;
  organisation_name: string;
  partner_type: string;
  custom_partner_type: string | null;
  payscribe_contact: string | null;
  outreach_status: string;
  priority: string | null;
  outcome_reason: string | null;
  slack_channel_id: string | null;
  slack_thread_ts: string | null;
};

type TicketThreadRecord = {
  ticket_id: string;
  subject: string;
  issue_description: string;
  business_id: string | null;
  issue_category: string;
  sub_category: string | null;
  priority: string;
  status: string;
  assigned_to: string | null;
  sla_deadline: string | null;
  slack_channel_id: string | null;
  slack_thread_ts: string | null;
};

type BusinessThreadRecord = {
  business_id: string;
  business_name: string;
  owner_name: string | null;
  lifecycle_stage: string;
  kyb_status: string;
  assigned_cs_owner: string | null;
  slack_channel_id: string | null;
  slack_thread_ts: string | null;
};

type ProductEventThreadRecord = {
  event_id: string;
  title: string;
  event_type: string;
  severity: string | null;
  status: string;
  posted_by: string;
  slack_channel_id: string | null;
  slack_thread_ts: string | null;
};

const businessReminderRuleKeys = [
  "business_kyb_not_submitted",
  "business_no_first_transaction_first_alert",
  "business_no_first_transaction_at_risk",
  "business_inactive_first_alert",
  "business_inactive_second_alert",
  "business_inactive_churn_review",
  "business_transaction_limit_warning"
];

const productEventThreadRuleKeys = [
  "product_outage_high_critical_reported",
  "product_event_resolved"
];

function staffName(
  staffMembers: StaffUser[],
  userId: string | null | undefined
) {
  return (
    staffMembers.find((staffMember) => staffMember.user_id === userId)
      ?.full_name ?? "Unassigned"
  );
}

function partnerDisplayType(partner: PartnerThreadRecord) {
  return partner.partner_type === "Other" && partner.custom_partner_type
    ? partner.custom_partner_type
    : partner.partner_type;
}

function businessNameForTicket(
  ticket: TicketThreadRecord,
  businesses: Business[]
) {
  return (
    businesses.find((business) => business.business_id === ticket.business_id)
      ?.business_name ??
    ticket.business_id ??
    "Unmatched email"
  );
}

function deliverableEvents(events: NewAutomationEvent[]) {
  return events.filter(
    (event) => event.target_channel !== "slack_dm" || Boolean(event.target_user_id)
  );
}

async function notificationAlreadySent(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  dedupeKey: string
) {
  const { data } = await supabase
    .from("automation_events")
    .select("status")
    .eq("dedupe_key", dedupeKey)
    .maybeSingle<{ status: string }>();

  return data?.status === "Sent";
}

async function recordThreadDelivery({
  dedupeKey,
  errorMessage,
  event,
  status,
  supabase
}: {
  dedupeKey: string;
  errorMessage: string | null;
  event: NewAutomationEvent;
  status: "Sent" | "Failed";
  supabase: ReturnType<typeof createSupabaseAdminClient>;
}) {
  await supabase.from("automation_events").upsert(
    {
      ...event,
      dedupe_key: dedupeKey,
      status,
      processed_at: new Date().toISOString(),
      error_message: errorMessage
    },
    {
      onConflict: "dedupe_key"
    }
  );
}

async function ensureLeadThread({
  lead,
  staffMembers,
  supabase,
  token,
  channelId
}: {
  lead: LeadThreadRecord;
  staffMembers: StaffUser[];
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  token: string;
  channelId: string;
}) {
  if (lead.slack_channel_id && lead.slack_thread_ts) {
    return {
      channelId: lead.slack_channel_id,
      threadTs: lead.slack_thread_ts
    };
  }

  const posted = await sendSlackChannelMessage({
    channelId,
    message: slackFieldTable("NEW LEAD", [
      ["Lead ID", lead.lead_id],
      ["Lead name", lead.full_name],
      ["Business Name", lead.business_name],
      ["Source", lead.source],
      ["Product interest", lead.product_interest.join(", ")],
      ["Stage", lead.stage],
      ["Status", lead.status],
      ["Assigned to", staffName(staffMembers, lead.assigned_to)],
      ["Next follow-up", lead.next_followup_date]
    ]),
    module: "Leads",
    recordId: lead.lead_id,
    token
  });

  await supabase
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

async function ensurePartnerThread({
  partner,
  staffMembers,
  supabase,
  token,
  channelId
}: {
  partner: PartnerThreadRecord;
  staffMembers: StaffUser[];
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  token: string;
  channelId: string;
}) {
  if (partner.slack_channel_id && partner.slack_thread_ts) {
    return {
      channelId: partner.slack_channel_id,
      threadTs: partner.slack_thread_ts
    };
  }

  const posted = await sendSlackChannelMessage({
    channelId,
    message: slackFieldTable("NEW PARTNER", [
      ["Partner ID", partner.partner_id],
      ["Organisation", partner.organisation_name],
      ["Type", partnerDisplayType(partner)],
      ["Status", partner.outreach_status],
      ["Priority", partner.priority],
      ["Owned by", staffName(staffMembers, partner.payscribe_contact)]
    ]),
    module: "Partners",
    recordId: partner.partner_id,
    token
  });

  await supabase
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

async function ensureTicketThread({
  ticket,
  businesses,
  staffMembers,
  supabase,
  token,
  channelId
}: {
  ticket: TicketThreadRecord;
  businesses: Business[];
  staffMembers: StaffUser[];
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  token: string;
  channelId: string;
}) {
  if (ticket.slack_channel_id && ticket.slack_thread_ts) {
    return {
      channelId: ticket.slack_channel_id,
      threadTs: ticket.slack_thread_ts
    };
  }

  const assignee = ticket.assigned_to
    ? staffMembers.find((staffMember) => staffMember.user_id === ticket.assigned_to)
    : null;
  const posted = await sendSlackChannelMessage({
    channelId,
    message: ticketOpenedSlackMessage({
      assignedTo: assignee?.full_name ?? "Unassigned",
      businessName: businessNameForTicket(ticket, businesses),
      description: ticket.issue_description,
      category: ticket.issue_category,
      priority: ticket.priority,
      sla: ticket.sla_deadline,
      subCategory: ticket.sub_category,
      subject: ticket.subject,
      ticketId: ticket.ticket_id
    }),
    module: "Tickets",
    recordId: ticket.ticket_id,
    token
  });

  await supabase
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

async function ensureBusinessThread({
  business,
  staffMembers,
  supabase,
  token,
  channelId
}: {
  business: BusinessThreadRecord;
  staffMembers: StaffUser[];
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  token: string;
  channelId: string;
}) {
  if (business.slack_channel_id && business.slack_thread_ts) {
    return {
      channelId: business.slack_channel_id,
      threadTs: business.slack_thread_ts
    };
  }

  const posted = await sendSlackChannelMessage({
    channelId,
    message: slackFieldTable("BUSINESS", [
      ["Business ID", business.business_id],
      ["Business Name", business.business_name],
      ["Owner", business.owner_name],
      ["Lifecycle", business.lifecycle_stage],
      ["KYB status", business.kyb_status],
      ["CS owner", staffName(staffMembers, business.assigned_cs_owner)]
    ]),
    module: "Businesses",
    recordId: business.business_id,
    token
  });

  await supabase
    .from("businesses")
    .update({
      slack_channel_id: posted.channelId,
      slack_thread_ts: posted.ts
    })
    .eq("business_id", business.business_id);

  return {
    channelId: posted.channelId,
    threadTs: posted.ts
  };
}

async function ensureProductEventThread({
  event,
  staffMembers,
  supabase,
  token,
  channelId
}: {
  event: ProductEventThreadRecord;
  staffMembers: StaffUser[];
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  token: string;
  channelId: string;
}) {
  if (event.slack_channel_id && event.slack_thread_ts) {
    return {
      channelId: event.slack_channel_id,
      threadTs: event.slack_thread_ts
    };
  }

  const posted = await sendSlackChannelMessage({
    channelId,
    message: slackFieldTable("PRODUCT EVENT", [
      ["Event ID", event.event_id],
      ["Title", event.title],
      ["Type", event.event_type],
      ["Severity", event.severity],
      ["Status", event.status],
      ["Posted by", staffName(staffMembers, event.posted_by)]
    ]),
    module: "Product Log",
    recordId: event.event_id,
    token
  });

  await supabase
    .from("product_events")
    .update({
      slack_channel_id: posted.channelId,
      slack_thread_ts: posted.ts
    })
    .eq("event_id", event.event_id);

  return {
    channelId: posted.channelId,
    threadTs: posted.ts
  };
}

async function sendLeadFollowUpThreadReplies({
  events,
  staffMembers,
  supabase
}: {
  events: NewAutomationEvent[];
  staffMembers: StaffUser[];
  supabase: ReturnType<typeof createSupabaseAdminClient>;
}): Promise<ThreadReplyResult> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channelId = process.env.SLACK_CRM_TICKETS_CHANNEL_ID;

  if (!token || !channelId) {
    return { failedCount: 0, sentCount: 0, skippedCount: 0 };
  }

  let failedCount = 0;
  let sentCount = 0;
  let skippedCount = 0;

  for (const event of events.filter(
    (item) => item.rule_key === "lead_follow_up_due"
  )) {
    const dedupeKey = `thread:${event.dedupe_key}`;

    if (await notificationAlreadySent(supabase, dedupeKey)) {
      skippedCount += 1;
      continue;
    }

    try {
      const { data: lead } = await supabase
        .from("leads")
        .select(
          "lead_id, full_name, business_name, source, product_interest, stage, status, assigned_to, next_followup_date, slack_channel_id, slack_thread_ts"
        )
        .eq("lead_id", event.record_id)
        .maybeSingle<LeadThreadRecord>();

      if (!lead) {
        skippedCount += 1;
        continue;
      }

      const thread = await ensureLeadThread({
        channelId,
        lead,
        staffMembers,
        supabase,
        token
      });

      await sendSlackChannelMessage({
        channelId: thread.channelId,
        message: slackFieldTable("LEAD FOLLOW-UP DUE", [
          ["Lead ID", lead.lead_id],
          ["Lead name", lead.full_name],
          ["Business Name", lead.business_name],
          ["Assigned to", staffName(staffMembers, lead.assigned_to)],
          ["Next follow-up", lead.next_followup_date],
          ["Action", "Follow-up due today or overdue"]
        ]),
        module: "Leads",
        recordId: lead.lead_id,
        threadTs: thread.threadTs,
        token
      });

      await recordThreadDelivery({
        dedupeKey,
        errorMessage: null,
        event,
        status: "Sent",
        supabase
      });
      sentCount += 1;
    } catch (error) {
      failedCount += 1;
      await recordThreadDelivery({
        dedupeKey,
        errorMessage:
          error instanceof Error ? error.message : "Lead thread reply failed.",
        event,
        status: "Failed",
        supabase
      });
    }
  }

  return { failedCount, sentCount, skippedCount };
}

async function sendPartnerReviewThreadReplies({
  events,
  staffMembers,
  supabase
}: {
  events: NewAutomationEvent[];
  staffMembers: StaffUser[];
  supabase: ReturnType<typeof createSupabaseAdminClient>;
}): Promise<ThreadReplyResult> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channelId = process.env.SLACK_CRM_TICKETS_CHANNEL_ID;

  if (!token || !channelId) {
    return { failedCount: 0, sentCount: 0, skippedCount: 0 };
  }

  let failedCount = 0;
  let sentCount = 0;
  let skippedCount = 0;

  for (const event of events.filter(
    (item) => item.rule_key === "partner_review_due"
  )) {
    const dedupeKey = `thread:${event.dedupe_key}`;

    if (await notificationAlreadySent(supabase, dedupeKey)) {
      skippedCount += 1;
      continue;
    }

    try {
      const { data: partner } = await supabase
        .from("partners")
        .select(
          "partner_id, organisation_name, partner_type, custom_partner_type, payscribe_contact, outreach_status, priority, outcome_reason, slack_channel_id, slack_thread_ts"
        )
        .eq("partner_id", event.record_id)
        .maybeSingle<PartnerThreadRecord>();

      if (!partner) {
        skippedCount += 1;
        continue;
      }

      const thread = await ensurePartnerThread({
        channelId,
        partner,
        staffMembers,
        supabase,
        token
      });

      await sendSlackChannelMessage({
        channelId: thread.channelId,
        message: slackFieldTable("PARTNER REVIEW DUE", [
          ["Partner ID", partner.partner_id],
          ["Organisation", partner.organisation_name],
          ["Owner", staffName(staffMembers, partner.payscribe_contact)],
          ["Original outcome", partner.outcome_reason ?? "Not recorded"],
          ["Action", "Review due today or overdue"]
        ]),
        module: "Partners",
        recordId: partner.partner_id,
        threadTs: thread.threadTs,
        token
      });

      await recordThreadDelivery({
        dedupeKey,
        errorMessage: null,
        event,
        status: "Sent",
        supabase
      });
      sentCount += 1;
    } catch (error) {
      failedCount += 1;
      await recordThreadDelivery({
        dedupeKey,
        errorMessage:
          error instanceof Error ? error.message : "Partner thread reply failed.",
        event,
        status: "Failed",
        supabase
      });
    }
  }

  return { failedCount, sentCount, skippedCount };
}

async function sendTicketReminderThreadReplies({
  events,
  businesses,
  staffMembers,
  supabase
}: {
  events: NewAutomationEvent[];
  businesses: Business[];
  staffMembers: StaffUser[];
  supabase: ReturnType<typeof createSupabaseAdminClient>;
}): Promise<ThreadReplyResult> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channelId = process.env.SLACK_CRM_TICKETS_CHANNEL_ID;

  if (!token || !channelId) {
    return { failedCount: 0, sentCount: 0, skippedCount: 0 };
  }

  let failedCount = 0;
  let sentCount = 0;
  let skippedCount = 0;

  for (const event of events.filter((item) =>
    ["ticket_sla_halfway", "ticket_sla_breached"].includes(item.rule_key)
  )) {
    const dedupeKey = `thread:${event.dedupe_key}`;

    if (await notificationAlreadySent(supabase, dedupeKey)) {
      skippedCount += 1;
      continue;
    }

    try {
      const { data: ticket } = await supabase
        .from("tickets")
        .select(
          "ticket_id, subject, issue_description, business_id, issue_category, sub_category, priority, status, assigned_to, sla_deadline, slack_channel_id, slack_thread_ts"
        )
        .eq("ticket_id", event.record_id)
        .maybeSingle<TicketThreadRecord>();

      if (!ticket) {
        skippedCount += 1;
        continue;
      }

      const thread = await ensureTicketThread({
        businesses,
        channelId,
        staffMembers,
        supabase,
        ticket,
        token
      });

      await sendSlackChannelMessage({
        channelId: thread.channelId,
        message: event.message,
        module: "Tickets",
        recordId: ticket.ticket_id,
        threadTs: thread.threadTs,
        token
      });

      await recordThreadDelivery({
        dedupeKey,
        errorMessage: null,
        event,
        status: "Sent",
        supabase
      });
      sentCount += 1;
    } catch (error) {
      failedCount += 1;
      await recordThreadDelivery({
        dedupeKey,
        errorMessage:
          error instanceof Error ? error.message : "Ticket thread reply failed.",
        event,
        status: "Failed",
        supabase
      });
    }
  }

  return { failedCount, sentCount, skippedCount };
}

async function sendBusinessReminderThreadReplies({
  events,
  staffMembers,
  supabase
}: {
  events: NewAutomationEvent[];
  staffMembers: StaffUser[];
  supabase: ReturnType<typeof createSupabaseAdminClient>;
}): Promise<ThreadReplyResult> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channelId = process.env.SLACK_CRM_TICKETS_CHANNEL_ID;

  if (!token || !channelId) {
    return { failedCount: 0, sentCount: 0, skippedCount: 0 };
  }

  let failedCount = 0;
  let sentCount = 0;
  let skippedCount = 0;

  for (const event of events.filter((item) =>
    businessReminderRuleKeys.includes(item.rule_key)
  )) {
    const dedupeKey = `thread:${event.dedupe_key}`;

    if (await notificationAlreadySent(supabase, dedupeKey)) {
      skippedCount += 1;
      continue;
    }

    try {
      const { data: business } = await supabase
        .from("businesses")
        .select(
          "business_id, business_name, owner_name, lifecycle_stage, kyb_status, assigned_cs_owner, slack_channel_id, slack_thread_ts"
        )
        .eq("business_id", event.record_id)
        .maybeSingle<BusinessThreadRecord>();

      if (!business) {
        skippedCount += 1;
        continue;
      }

      const thread = await ensureBusinessThread({
        business,
        channelId,
        staffMembers,
        supabase,
        token
      });

      await sendSlackChannelMessage({
        channelId: thread.channelId,
        message: event.message,
        module: "Businesses",
        recordId: business.business_id,
        threadTs: thread.threadTs,
        token
      });

      await recordThreadDelivery({
        dedupeKey,
        errorMessage: null,
        event,
        status: "Sent",
        supabase
      });
      sentCount += 1;
    } catch (error) {
      failedCount += 1;
      await recordThreadDelivery({
        dedupeKey,
        errorMessage:
          error instanceof Error ? error.message : "Business thread reply failed.",
        event,
        status: "Failed",
        supabase
      });
    }
  }

  return { failedCount, sentCount, skippedCount };
}

async function sendProductEventThreadReplies({
  events,
  staffMembers,
  supabase
}: {
  events: NewAutomationEvent[];
  staffMembers: StaffUser[];
  supabase: ReturnType<typeof createSupabaseAdminClient>;
}): Promise<ThreadReplyResult> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channelId = process.env.SLACK_CRM_TICKETS_CHANNEL_ID;

  if (!token || !channelId) {
    return { failedCount: 0, sentCount: 0, skippedCount: 0 };
  }

  let failedCount = 0;
  let sentCount = 0;
  let skippedCount = 0;

  // Product events aren't sent through the generic DM/channel delivery path
  // (see deliverableEvents filtering in runDailySlackAutomations) since both
  // rule keys below already post into this same Slack channel - this
  // function is their only delivery path, so it uses each event's own
  // dedupe_key directly instead of a "thread:" prefixed shadow key.
  for (const event of events.filter((item) =>
    productEventThreadRuleKeys.includes(item.rule_key)
  )) {
    const dedupeKey = event.dedupe_key;

    if (await notificationAlreadySent(supabase, dedupeKey)) {
      skippedCount += 1;
      continue;
    }

    try {
      const { data: productEvent } = await supabase
        .from("product_events")
        .select(
          "event_id, title, event_type, severity, status, posted_by, slack_channel_id, slack_thread_ts"
        )
        .eq("event_id", event.record_id)
        .maybeSingle<ProductEventThreadRecord>();

      if (!productEvent) {
        skippedCount += 1;
        continue;
      }

      const thread = await ensureProductEventThread({
        channelId,
        event: productEvent,
        staffMembers,
        supabase,
        token
      });

      await sendSlackChannelMessage({
        channelId: thread.channelId,
        message: event.message,
        module: "Product Log",
        recordId: productEvent.event_id,
        threadTs: thread.threadTs,
        token
      });

      await recordThreadDelivery({
        dedupeKey,
        errorMessage: null,
        event,
        status: "Sent",
        supabase
      });
      sentCount += 1;
    } catch (error) {
      failedCount += 1;
      await recordThreadDelivery({
        dedupeKey,
        errorMessage:
          error instanceof Error
            ? error.message
            : "Product event thread reply failed.",
        event,
        status: "Failed",
        supabase
      });
    }
  }

  return { failedCount, sentCount, skippedCount };
}

export async function runDailySlackAutomations() {
  const supabase = createSupabaseAdminClient();
  const [
    { data: businesses },
    { data: leads },
    { data: tickets },
    { data: productEvents },
    { data: partners },
    { data: tasks },
    { data: staffMembers },
    { data: automationSettings }
  ] = await Promise.all([
    supabase.from("businesses").select("*").returns<Business[]>(),
    supabase.from("leads").select("*").returns<Lead[]>(),
    supabase.from("tickets").select("*").returns<Ticket[]>(),
    supabase.from("product_events").select("*").returns<ProductEvent[]>(),
    supabase.from("partners").select("*").returns<Partner[]>(),
    supabase.from("tasks").select("*").eq("status", "Open").returns<Task[]>(),
    supabase.from("users").select("*").eq("status", "Active").returns<StaffUser[]>(),
    supabase
      .from("automation_settings")
      .select("*")
      .eq("settings_id", true)
      .maybeSingle<AutomationSettings>()
  ]);

  const activeStaff = staffMembers ?? [];
  const events = [
    ...buildBusinessAutomationEvents({
      businesses: businesses ?? [],
      settings: automationSettings ?? defaultAutomationSettings,
      staffMembers: activeStaff
    }),
    ...buildLeadAutomationEvents({
      leads: leads ?? [],
      staffMembers: activeStaff
    }),
    ...buildTicketAutomationEvents({
      businesses: businesses ?? [],
      staffMembers: activeStaff,
      tickets: tickets ?? []
    }),
    ...buildProductEventAutomationEvents({
      productEvents: productEvents ?? [],
      staffMembers: activeStaff
    }),
    ...buildPartnerAutomationEvents({
      partners: partners ?? [],
      staffMembers: activeStaff
    }),
    ...buildTaskAutomationEvents({
      tasks: tasks ?? [],
      staffMembers: activeStaff
    })
  ];
  const deliverable = deliverableEvents(events);
  const eventsSkippedWithoutAssignee = events.length - deliverable.length;
  // Product event reminders route exclusively through
  // sendProductEventThreadReplies below - they already land in the same
  // Slack channel as the generic delivery path, so sending them there too
  // would duplicate every message.
  const eventsToSend = deliverable.filter(
    (event) => !productEventThreadRuleKeys.includes(event.rule_key)
  );
  const productEventThreadEvents = events.filter((event) =>
    productEventThreadRuleKeys.includes(event.rule_key)
  );

  const delivery = await deliverSlackEventsImmediately({
    events: eventsToSend,
    staffMembers: activeStaff,
    supabase
  });
  const leadThreads = await sendLeadFollowUpThreadReplies({
    events: eventsToSend,
    staffMembers: activeStaff,
    supabase
  });
  const partnerThreads = await sendPartnerReviewThreadReplies({
    events: eventsToSend,
    staffMembers: activeStaff,
    supabase
  });
  const ticketThreads = await sendTicketReminderThreadReplies({
    businesses: businesses ?? [],
    events: eventsToSend,
    staffMembers: activeStaff,
    supabase
  });
  const businessThreads = await sendBusinessReminderThreadReplies({
    events: eventsToSend,
    staffMembers: activeStaff,
    supabase
  });
  const productEventThreads = await sendProductEventThreadReplies({
    events: productEventThreadEvents,
    staffMembers: activeStaff,
    supabase
  });

  return {
    eventsChecked: events.length,
    eventsSkippedWithoutAssignee,
    failedCount:
      delivery.failedCount +
      leadThreads.failedCount +
      partnerThreads.failedCount +
      ticketThreads.failedCount +
      businessThreads.failedCount +
      productEventThreads.failedCount,
    sentCount:
      delivery.sentCount +
      leadThreads.sentCount +
      partnerThreads.sentCount +
      ticketThreads.sentCount +
      businessThreads.sentCount +
      productEventThreads.sentCount,
    skippedCount:
      delivery.skippedCount +
      leadThreads.skippedCount +
      partnerThreads.skippedCount +
      ticketThreads.skippedCount +
      businessThreads.skippedCount +
      productEventThreads.skippedCount,
    threadRepliesSent:
      leadThreads.sentCount +
      partnerThreads.sentCount +
      ticketThreads.sentCount +
      businessThreads.sentCount +
      productEventThreads.sentCount
  };
}
