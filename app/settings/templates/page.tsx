import { AppShell } from "@/components/app-shell";
import { DeleteTemplateForm } from "@/components/settings/delete-template-form";
import { EmptyTableRow } from "@/components/ui/empty-table-row";
import { FormModal } from "@/components/ui/form-modal";
import { PageHeader } from "@/components/ui/page-header";
import { StatusAlert } from "@/components/ui/status-alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import {
  crmModules,
  permissionActions,
  type PermissionTemplate
} from "@/lib/types/permissions";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createPermissionTemplate } from "../actions";

type TemplatesPageProps = {
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

export default async function PermissionTemplatesPage({
  searchParams
}: TemplatesPageProps) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();

  if (!currentUser.is_super_admin) {
    redirect("/");
  }

  const { data: templates } = await supabase
    .from("permission_templates")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<PermissionTemplate[]>();

  return (
    <AppShell currentUser={currentUser} permissions={permissions}>
      <section>
        <PageHeader
          eyebrow="Settings"
          title="Permission Templates"
          description="Create reusable permission grids that can be applied to new or existing staff members."
          actions={
            <>
          <FormModal
            buttonLabel="Add New Template"
            title="Create Template"
            description="Set a name, description, and default permissions for the template."
          >
            <form action={createPermissionTemplate}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-neutral-800">
                    Template name
                  </span>
                  <input
                    required
                    name="template_name"
                    className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-neutral-800">
                    Description
                  </span>
                  <input
                    name="description"
                    className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                  />
                </label>
              </div>

              <div className="mt-5 overflow-x-auto rounded border border-neutral-200">
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
                    {crmModules.map((module) => (
                      <tr key={module}>
                        <td className="px-4 py-4 font-semibold text-neutral-950">
                          {module}
                        </td>
                        {permissionActions.map((action) => (
                          <td key={action} className="px-4 py-4 text-center">
                            <input
                              type="checkbox"
                              name={`${module}:${action}`}
                              className="h-5 w-5 accent-payscribe-blue"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 flex justify-end">
                <SubmitButton pendingText="Creating template...">
                  Create Template
                </SubmitButton>
              </div>
            </form>
          </FormModal>
          <Link
            href="/settings"
            className="rounded border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 transition hover:border-payscribe-blue hover:text-payscribe-blue"
          >
            Back to Settings
          </Link>
            </>
          }
        />

        <StatusAlert type="error" message={searchParams?.error} />
        <StatusAlert type="success" message={searchParams?.success} />

        <div className="mt-6 overflow-hidden rounded border border-neutral-200 bg-white">
          <div className="border-b border-neutral-200 px-4 py-3">
            <h3 className="text-base font-semibold text-neutral-950">
              Saved Templates
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Template</th>
                  <th className="px-4 py-3">Enabled Permissions</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {(templates ?? []).map((template) => {
                  const enabledCount = crmModules.reduce(
                    (total, module) =>
                      total +
                      permissionActions.filter(
                        (action) => template.permissions[module]?.[action]
                      ).length,
                    0
                  );

                  return (
                    <tr key={template.template_id}>
                      <td className="px-4 py-4">
                        <div className="font-semibold text-neutral-950">
                          {template.template_name}
                        </div>
                        <div className="mt-1 text-xs text-neutral-500">
                          {template.description ?? "No description"}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-neutral-700">
                        {enabledCount}
                      </td>
                      <td className="px-4 py-4">
                        <DeleteTemplateForm
                          templateId={template.template_id}
                          templateName={template.template_name}
                        />
                      </td>
                    </tr>
                  );
                })}

                {(templates ?? []).length === 0 ? (
                  <EmptyTableRow
                    colSpan={3}
                    message="No templates created yet."
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
