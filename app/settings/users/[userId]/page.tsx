import { AppShell } from "@/components/app-shell";
import { StaffStatusForm } from "@/components/settings/staff-status-form";
import { StatusAlert } from "@/components/ui/status-alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { formatDate } from "@/lib/format/date";
import type { StaffUser } from "@/lib/types/users";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { updateStaffProfile } from "../../actions";

type StaffProfilePageProps = {
  params: {
    userId: string;
  };
  searchParams?: {
    error?: string;
    success?: string;
  };
};

export default async function StaffProfilePage({
  params,
  searchParams
}: StaffProfilePageProps) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();

  if (!currentUser.is_super_admin) {
    redirect("/");
  }

  const { data: staffMember } = await supabase
    .from("users")
    .select("*")
    .eq("user_id", params.userId)
    .single<StaffUser>();

  if (!staffMember) {
    notFound();
  }

  return (
    <AppShell currentUser={currentUser} permissions={permissions}>
      <section>
        <div className="flex flex-col gap-4 border-b border-neutral-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-payscribe-blue">
              Settings
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-normal text-neutral-950">
              Edit Staff Profile
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
              Update display details and account status for {staffMember.full_name}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/settings/users/${staffMember.user_id}/permissions`}
              className="rounded bg-payscribe-blue px-4 py-2 text-sm font-semibold text-white"
            >
              Permissions
            </Link>
            <Link
              href="/settings"
              className="rounded border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 transition hover:border-payscribe-blue hover:text-payscribe-blue"
            >
              Back to Settings
            </Link>
          </div>
        </div>

        <StatusAlert type="error" message={searchParams?.error} />
        <StatusAlert type="success" message={searchParams?.success} />

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded border border-neutral-200 bg-white p-5">
            <p className="text-sm font-medium text-neutral-500">Status</p>
            <p className="mt-2 text-xl font-semibold text-neutral-950">
              {staffMember.status}
            </p>
          </div>
          <div className="rounded border border-neutral-200 bg-white p-5">
            <p className="text-sm font-medium text-neutral-500">Created</p>
            <p className="mt-2 text-xl font-semibold text-neutral-950">
              {formatDate(staffMember.created_at)}
            </p>
          </div>
          <div className="rounded border border-neutral-200 bg-white p-5">
            <p className="text-sm font-medium text-neutral-500">Last login</p>
            <p className="mt-2 text-xl font-semibold text-neutral-950">
              {formatDate(staffMember.last_login_at)}
            </p>
          </div>
        </div>

        <form
          action={updateStaffProfile}
          className="mt-6 rounded border border-neutral-200 bg-white p-5"
        >
          <input type="hidden" name="user_id" value={staffMember.user_id} />
          <div>
            <h3 className="text-base font-semibold text-neutral-950">
              Profile Details
            </h3>
            <p className="mt-1 text-sm text-neutral-600">
              Job title and department are for display only. They do not control
              access.
            </p>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Full name
              </span>
              <input
                required
                name="full_name"
                defaultValue={staffMember.full_name}
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
                defaultValue={staffMember.email}
                className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Job title
              </span>
              <input
                name="job_title"
                defaultValue={staffMember.job_title ?? ""}
                className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Department
              </span>
              <input
                name="department"
                defaultValue={staffMember.department ?? ""}
                className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
              />
            </label>

            <label className="block md:col-span-2">
              <span className="text-sm font-medium text-neutral-800">
                Slack user ID
              </span>
              <input
                name="slack_user_id"
                defaultValue={staffMember.slack_user_id ?? ""}
                className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
              />
            </label>
          </div>

          <div className="mt-5 flex justify-end">
            <SubmitButton pendingText="Saving profile...">
              Save Profile
            </SubmitButton>
          </div>
        </form>

        <div className="mt-6 rounded border border-neutral-200 bg-white p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-base font-semibold text-neutral-950">
                Account Status
              </h3>
              <p className="mt-1 text-sm text-neutral-600">
                Deactivation disables access and flags assigned records for
                reassignment through the database trigger.
              </p>
            </div>
            <StaffStatusForm
              userId={staffMember.user_id}
              fullName={staffMember.full_name}
              currentStatus={staffMember.status}
              isSuperAdmin={staffMember.is_super_admin}
            />
          </div>
        </div>
      </section>
    </AppShell>
  );
}
