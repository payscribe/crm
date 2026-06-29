import { AppShell } from "@/components/app-shell";
import { EmptyTableRow } from "@/components/ui/empty-table-row";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusAlert } from "@/components/ui/status-alert";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  retryFailedSlackAutomationEvents,
  sendPendingSlackAutomationEvents,
  sendSlackDmTest
} from "@/app/settings/actions";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { buildBusinessAutomationEvents } from "@/lib/automations/business-events";
import { buildLeadAutomationEvents } from "@/lib/automations/lead-events";
import { buildPartnerAutomationEvents } from "@/lib/automations/partner-events";
import { buildProductEventAutomationEvents } from "@/lib/automations/product-event-events";
import { buildTicketAutomationEvents } from "@/lib/automations/ticket-events";
import { defaultAutomationSettings } from "@/lib/constants/automation-settings";
import { formatDate } from "@/lib/format/date";
import type { AutomationSettings } from "@/lib/types/automation-settings";
import type { AutomationEvent } from "@/lib/types/automation-events";
import type { Business } from "@/lib/types/businesses";
import type { Lead } from "@/lib/types/leads";
import type { Partner } from "@/lib/types/partners";
import type { ProductEvent } from "@/lib/types/product-events";
import type { Ticket } from "@/lib/types/tickets";
import type { StaffUser } from "@/lib/types/users";
import Link from "next/link";
import { redirect } from "next/navigation";

type AutomationsPageProps = {
  searchParams?: {
    error?: string;
    success?: string;
  };
};

export default async function AutomationsPage({
  searchParams
}: AutomationsPageProps) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();

  if (!currentUser.is_super_admin) {
    redirect("/");
  }

  const [
    { data: businesses },
    { data: leads },
    { data: tickets },
    { data: productEvents },
    { data: partners },
    { data: staffMembers },
    { data: automationSettings },
    { data: eventLog }
  ] = await Promise.all([
    supabase.from("businesses").select("*").returns<Business[]>(),
    supabase.from("leads").select("*").returns<Lead[]>(),
    supabase.from("tickets").select("*").returns<Ticket[]>(),
    supabase.from("product_events").select("*").returns<ProductEvent[]>(),
    supabase.from("partners").select("*").returns<Partner[]>(),
    supabase.from("users").select("*").returns<StaffUser[]>(),
    supabase
      .from("automation_settings")
      .select("*")
      .eq("settings_id", true)
      .maybeSingle<AutomationSettings>(),
    supabase
      .from("automation_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(25)
      .returns<AutomationEvent[]>()
  ]);

  const businessPreviewEvents = buildBusinessAutomationEvents({
    businesses: businesses ?? [],
    staffMembers: staffMembers ?? [],
    settings: automationSettings ?? defaultAutomationSettings
  });
  const leadPreviewEvents = buildLeadAutomationEvents({
    leads: leads ?? [],
    staffMembers: staffMembers ?? []
  });
  const ticketPreviewEvents = buildTicketAutomationEvents({
    tickets: tickets ?? [],
    businesses: businesses ?? [],
    staffMembers: staffMembers ?? []
  });
  const productPreviewEvents = buildProductEventAutomationEvents({
    productEvents: productEvents ?? [],
    staffMembers: staffMembers ?? []
  });
  const partnerPreviewEvents = buildPartnerAutomationEvents({
    partners: partners ?? [],
    staffMembers: staffMembers ?? []
  });
  const previewEvents = [
    ...businessPreviewEvents,
    ...leadPreviewEvents,
    ...ticketPreviewEvents,
    ...productPreviewEvents,
    ...partnerPreviewEvents
  ];

  const staffById = new Map(
    (staffMembers ?? []).map((staffMember) => [
      staffMember.user_id,
      staffMember.full_name
    ])
  );
  const failedSlackEvents = (eventLog ?? []).filter(
    (event) =>
      event.status === "Failed" &&
      ["slack_dm", "crm_tickets", "crm_leads", "crm_general"].includes(
        event.target_channel ?? ""
      )
  );
  const slackConfigCount = [
    process.env.SLACK_BOT_TOKEN,
    process.env.SLACK_CRM_TICKETS_CHANNEL_ID
  ].filter(Boolean).length;

  return (
    <AppShell currentUser={currentUser} permissions={permissions}>
      <section>
        <PageHeader
          eyebrow="Settings"
          title="Automation Events"
          description="Daily Slack automations run automatically at 9:00 AM Lagos time. This screen shows what is due and what was recently sent."
          actions={
            <Link
              href="/settings"
              className="rounded border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 transition hover:border-payscribe-blue hover:text-payscribe-blue"
            >
              Back to Settings
            </Link>
          }
        />

        <StatusAlert type="error" message={searchParams?.error} />
        <StatusAlert type="success" message={searchParams?.success} />

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <MetricCard label="Due Events Now" value={previewEvents.length} />
          <MetricCard label="Notification Log" value={(eventLog ?? []).length} />
          <MetricCard label="Slack Config" value={`${slackConfigCount}/2`} />
          <MetricCard label="Failed Events" value={failedSlackEvents.length} />
        </div>

        <div className="mt-6 rounded border border-blue-100 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-900">
          Slack due-date reminders are automatic. Vercel calls
          <span className="font-semibold"> /api/automations/slack/daily </span>
          every day at 08:00 UTC, which is 09:00 in Lagos.
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <div className="rounded border border-neutral-200 bg-white p-4">
            <h3 className="text-base font-semibold text-neutral-950">
              Test Slack DM
            </h3>
            <p className="mt-1 text-sm leading-6 text-neutral-600">
              Send a direct message to a staff member using the same path used
              by ticket assignments and note mentions.
            </p>
            <form
              action={sendSlackDmTest}
              className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]"
            >
              <select
                required
                name="user_id"
                className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
              >
                <option value="">Select staff member</option>
                {(staffMembers ?? [])
                  .filter((staffMember) => staffMember.status === "Active")
                  .map((staffMember) => (
                    <option
                      key={staffMember.user_id}
                      value={staffMember.user_id}
                    >
                      {staffMember.full_name}
                      {staffMember.slack_user_id
                        ? ` - ${staffMember.slack_user_id}`
                        : " - No Slack ID"}
                    </option>
                  ))}
              </select>
              <SubmitButton pendingText="Sending test...">
                Send Test DM
              </SubmitButton>
            </form>
          </div>

          <div className="rounded border border-neutral-200 bg-white p-4">
            <h3 className="text-base font-semibold text-neutral-950">
              Delivery Controls
            </h3>
            <p className="mt-1 text-sm leading-6 text-neutral-600">
              Use these only when reviewing failed or pending Slack events.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <form action={sendPendingSlackAutomationEvents}>
                <SubmitButton variant="secondary" pendingText="Sending...">
                  Send Pending
                </SubmitButton>
              </form>
              <form action={retryFailedSlackAutomationEvents}>
                <SubmitButton variant="outline" pendingText="Queueing...">
                  Retry Failed
                </SubmitButton>
              </form>
            </div>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded border border-neutral-200 bg-white">
          <div className="border-b border-neutral-200 px-4 py-3">
            <h3 className="text-base font-semibold text-neutral-950">
              Current Preview
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Rule</th>
                  <th className="px-4 py-3">Module</th>
                  <th className="px-4 py-3">Record</th>
                  <th className="px-4 py-3">Target</th>
                  <th className="px-4 py-3">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {previewEvents.map((event) => (
                  <tr key={event.dedupe_key}>
                    <td className="px-4 py-4 font-medium text-neutral-950">
                      {event.rule_key}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {event.module}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {event.record_id}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {event.target_user_id
                        ? staffById.get(event.target_user_id) ?? "Unknown"
                        : event.target_channel ?? "Not set"}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {event.message}
                    </td>
                  </tr>
                ))}

                {previewEvents.length === 0 ? (
                  <EmptyTableRow
                    colSpan={5}
                    message="No automation events match the current data."
                  />
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded border border-neutral-200 bg-white">
          <div className="border-b border-neutral-200 px-4 py-3">
            <h3 className="text-base font-semibold text-neutral-950">
              Recent Event Log
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Rule</th>
                  <th className="px-4 py-3">Record</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Error</th>
                  <th className="px-4 py-3">Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {(eventLog ?? []).map((event) => (
                  <tr key={event.event_id}>
                    <td className="px-4 py-4 text-neutral-700">
                      {formatDate(event.created_at)}
                    </td>
                    <td className="px-4 py-4 font-medium text-neutral-950">
                      {event.rule_key}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {event.record_id}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {event.status}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {event.error_message ?? "-"}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {event.message}
                    </td>
                  </tr>
                ))}

                {(eventLog ?? []).length === 0 ? (
                  <EmptyTableRow
                    colSpan={6}
                    message="No automation events have been logged yet."
                  />
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
