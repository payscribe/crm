import { AppShell } from "@/components/app-shell";
import { EmptyTableRow } from "@/components/ui/empty-table-row";
import { FormModal } from "@/components/ui/form-modal";
import { PageHeader } from "@/components/ui/page-header";
import { StatusAlert } from "@/components/ui/status-alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { defaultAutomationSettings } from "@/lib/constants/automation-settings";
import { formatDate } from "@/lib/format/date";
import type { AutomationSettings } from "@/lib/types/automation-settings";
import type { StaffUser } from "@/lib/types/users";
import Link from "next/link";
import { redirect } from "next/navigation";
import { inviteStaffMember, updateAutomationSettings } from "./actions";

type SettingsPageProps = {
  searchParams?: {
    error?: string;
    success?: string;
  };
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();

  if (!currentUser.is_super_admin) {
    redirect("/");
  }

  const [{ data: staffMembers }, { data: automationSettings }] =
    await Promise.all([
      supabase
        .from("users")
        .select("*")
        .order("created_at", { ascending: false })
        .returns<StaffUser[]>(),
      supabase
        .from("automation_settings")
        .select("*")
        .eq("settings_id", true)
        .maybeSingle<AutomationSettings>()
    ]);

  const settings = automationSettings ?? defaultAutomationSettings;

  return (
    <AppShell currentUser={currentUser} permissions={permissions}>
      <section>
        <PageHeader
          eyebrow="Settings"
          title="Staff Members"
          description="Admin-only user list for profile editing, invitations, templates, and permission grid access."
          actions={
            <>
            <FormModal
              buttonLabel="Add New Staff"
              title="Add New Staff Member"
              description="This sends a Supabase invitation email and creates default blocked permissions."
              size="default"
            >
              <form action={inviteStaffMember}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-medium text-neutral-800">
                      Full name
                    </span>
                    <input
                      required
                      name="full_name"
                      className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-neutral-800">
                      Email
                    </span>
                    <input
                      required
                      name="email"
                      type="email"
                      className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-neutral-800">
                      Job title
                    </span>
                    <input
                      name="job_title"
                      className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-neutral-800">
                      Department
                    </span>
                    <input
                      name="department"
                      className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                    />
                  </label>

                  <label className="block md:col-span-2">
                    <span className="text-sm font-medium text-neutral-800">
                      Slack user ID
                    </span>
                    <input
                      name="slack_user_id"
                      className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                    />
                  </label>
                </div>

                <div className="mt-5 flex justify-end">
                  <SubmitButton pendingText="Sending invitation...">
                    Send Invitation
                  </SubmitButton>
                </div>
              </form>
            </FormModal>
            <Link
              href="/settings/options"
              className="rounded border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 transition hover:border-payscribe-blue hover:text-payscribe-blue"
            >
              Option Lists
            </Link>
            <Link
              href="/settings/automations"
              className="rounded border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 transition hover:border-payscribe-blue hover:text-payscribe-blue"
            >
              Automation Events
            </Link>
            <Link
              href="/settings/templates"
              className="rounded bg-payscribe-blue px-4 py-2 text-sm font-semibold text-white"
            >
              Permission Templates
            </Link>
            </>
          }
        />

        <StatusAlert type="error" message={searchParams?.error} />
        <StatusAlert type="success" message={searchParams?.success} />

        <form
          action={updateAutomationSettings}
          className="mt-6 rounded border border-neutral-200 bg-white p-5"
        >
          <div>
            <h3 className="text-base font-semibold text-neutral-950">
              Business Automation Settings
            </h3>
            <p className="mt-1 text-sm text-neutral-600">
              These values control the Business Attention Center and will be
              used by Slack and email automations when they are enabled.
            </p>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                KYB not submitted alert after days
              </span>
              <input
                required
                name="kyb_not_submitted_days"
                type="number"
                min="1"
                step="1"
                defaultValue={settings.kyb_not_submitted_days}
                className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                No first transaction first alert days
              </span>
              <input
                required
                name="no_first_transaction_first_alert_days"
                type="number"
                min="1"
                step="1"
                defaultValue={
                  settings.no_first_transaction_first_alert_days
                }
                className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                No first transaction At Risk days
              </span>
              <input
                required
                name="no_first_transaction_at_risk_days"
                type="number"
                min="1"
                step="1"
                defaultValue={settings.no_first_transaction_at_risk_days}
                className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Inactive first alert days
              </span>
              <input
                required
                name="inactive_first_alert_days"
                type="number"
                min="1"
                step="1"
                defaultValue={settings.inactive_first_alert_days}
                className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Inactive second alert days
              </span>
              <input
                required
                name="inactive_second_alert_days"
                type="number"
                min="1"
                step="1"
                defaultValue={settings.inactive_second_alert_days}
                className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Mark churned after inactive days
              </span>
              <input
                required
                name="inactive_churn_days"
                type="number"
                min="1"
                step="1"
                defaultValue={settings.inactive_churn_days}
                className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Transaction limit warning percent
              </span>
              <input
                required
                name="transaction_limit_warning_percent"
                type="number"
                min="1"
                max="100"
                step="1"
                defaultValue={settings.transaction_limit_warning_percent}
                className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
              />
            </label>
          </div>

          <div className="mt-5 flex justify-end">
            <SubmitButton pendingText="Saving settings...">
              Save Automation Settings
            </SubmitButton>
          </div>
        </form>

        <div className="mt-6 overflow-hidden rounded border border-neutral-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Job Title</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last Login</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {(staffMembers ?? []).map((staffMember) => (
                  <tr key={staffMember.user_id}>
                    <td className="px-4 py-4">
                      <div className="font-medium text-neutral-950">
                        {staffMember.full_name}
                      </div>
                      <div className="mt-1 text-xs text-neutral-500">
                        {staffMember.email}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {staffMember.job_title ?? "Not set"}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {staffMember.department ?? "Not set"}
                    </td>
                    <td className="px-4 py-4">
                      <span className="rounded border border-neutral-200 px-2 py-1 text-xs font-semibold text-neutral-700">
                        {staffMember.status}
                      </span>
                      {staffMember.is_super_admin ? (
                        <span className="ml-2 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-payscribe-blue">
                          Super Admin
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {formatDate(staffMember.last_login_at)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/settings/users/${staffMember.user_id}`}
                          className="rounded border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-800 transition hover:border-payscribe-blue hover:text-payscribe-blue"
                        >
                          Edit Profile
                        </Link>
                        <Link
                          href={`/settings/users/${staffMember.user_id}/permissions`}
                          className="rounded border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-800 transition hover:border-payscribe-blue hover:text-payscribe-blue"
                        >
                          Permissions
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}

                {(staffMembers ?? []).length === 0 ? (
                  <EmptyTableRow colSpan={6} message="No staff members found." />
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
