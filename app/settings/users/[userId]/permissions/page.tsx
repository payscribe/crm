import { AppShell } from "@/components/app-shell";
import { StatusAlert } from "@/components/ui/status-alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import {
  crmModules,
  permissionActions,
  type PermissionTemplate,
  type UserPermission
} from "@/lib/types/permissions";
import type { StaffUser } from "@/lib/types/users";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  applyPermissionTemplate,
  updateStaffPermissions
} from "../../../actions";

type StaffPermissionsPageProps = {
  params: {
    userId: string;
  };
  searchParams?: {
    error?: string;
    success?: string;
  };
};

const actionLabels = {
  can_view: "View",
  can_create: "Create",
  can_edit: "Edit",
  can_delete: "Delete",
  can_assign: "Assign"
};

export default async function StaffPermissionsPage({
  params,
  searchParams
}: StaffPermissionsPageProps) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();

  if (!currentUser.is_super_admin) {
    redirect("/");
  }

  const [
    { data: staffMember },
    { data: staffPermissions },
    { data: templates }
  ] = await Promise.all([
    supabase
      .from("users")
      .select("*")
      .eq("user_id", params.userId)
      .single<StaffUser>(),
    supabase
      .from("permissions")
      .select("*")
      .eq("user_id", params.userId)
      .returns<UserPermission[]>(),
    supabase
      .from("permission_templates")
      .select("*")
      .order("template_name", { ascending: true })
      .returns<PermissionTemplate[]>()
  ]);

  if (!staffMember) {
    notFound();
  }

  const permissionsByModule = new Map(
    (staffPermissions ?? []).map((permission) => [
      permission.module,
      permission
    ])
  );

  return (
    <AppShell currentUser={currentUser} permissions={permissions}>
      <section>
        <div className="flex flex-col gap-4 border-b border-neutral-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-payscribe-blue">
              Settings
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-normal text-neutral-950">
              Edit Permissions
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
              Configure module access for {staffMember.full_name}. Changes take
              effect as soon as they are saved.
            </p>
          </div>
          <Link
            href="/settings"
            className="rounded border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 transition hover:border-payscribe-blue hover:text-payscribe-blue"
          >
            Back to Settings
          </Link>
        </div>

        <StatusAlert type="error" message={searchParams?.error} />
        <StatusAlert type="success" message={searchParams?.success} />

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded border border-neutral-200 bg-white p-5">
            <p className="text-sm font-medium text-neutral-500">Staff member</p>
            <p className="mt-2 text-xl font-semibold text-neutral-950">
              {staffMember.full_name}
            </p>
            <p className="mt-1 text-sm text-neutral-600">{staffMember.email}</p>
          </div>
          <div className="rounded border border-neutral-200 bg-white p-5">
            <p className="text-sm font-medium text-neutral-500">Job title</p>
            <p className="mt-2 text-xl font-semibold text-neutral-950">
              {staffMember.job_title ?? "Not set"}
            </p>
          </div>
          <div className="rounded border border-neutral-200 bg-white p-5">
            <p className="text-sm font-medium text-neutral-500">Status</p>
            <p className="mt-2 text-xl font-semibold text-neutral-950">
              {staffMember.status}
            </p>
          </div>
        </div>

        {staffMember.is_super_admin ? (
          <div className="mt-6 rounded border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-payscribe-blue">
            This account is a Super Admin. Super Admin access is controlled
            directly in Supabase and is not changed by this grid.
          </div>
        ) : null}

        <form
          action={applyPermissionTemplate}
          className="mt-6 rounded border border-neutral-200 bg-white p-5"
        >
          <input type="hidden" name="user_id" value={staffMember.user_id} />
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <h3 className="text-base font-semibold text-neutral-950">
                Apply Permission Template
              </h3>
              <p className="mt-1 text-sm text-neutral-600">
                Applying a template replaces this staff member&apos;s current
                grid. You can still adjust individual permissions afterwards.
              </p>
            </div>
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row">
              <select
                required
                name="template_id"
                className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20 sm:w-72"
              >
                <option value="">Select template</option>
                {(templates ?? []).map((template) => (
                  <option key={template.template_id} value={template.template_id}>
                    {template.template_name}
                  </option>
                ))}
              </select>
              <SubmitButton pendingText="Applying template...">
                Apply Template
              </SubmitButton>
            </div>
          </div>
        </form>

        <form
          action={updateStaffPermissions}
          className="mt-6 overflow-hidden rounded border border-neutral-200 bg-white"
        >
          <input type="hidden" name="user_id" value={staffMember.user_id} />
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Module</th>
                  {permissionActions.map((action) => (
                    <th key={action} className="px-4 py-3 text-center">
                      {actionLabels[action]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {crmModules.map((module) => {
                  const permission = permissionsByModule.get(module);

                  return (
                    <tr key={module}>
                      <td className="px-4 py-4 font-semibold text-neutral-950">
                        {module}
                      </td>
                      {permissionActions.map((action) => (
                        <td key={action} className="px-4 py-4 text-center">
                          <input
                            type="checkbox"
                            name={`${module}:${action}`}
                            defaultChecked={permission?.[action] ?? false}
                            className="h-5 w-5 accent-payscribe-blue"
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end border-t border-neutral-200 bg-neutral-50 px-4 py-4">
            <SubmitButton pendingText="Saving permissions...">
              Save Permissions
            </SubmitButton>
          </div>
        </form>
      </section>
    </AppShell>
  );
}
