import { AppShell } from "@/components/app-shell";
import { EmptyTableRow } from "@/components/ui/empty-table-row";
import { PageHeader } from "@/components/ui/page-header";
import { StatusAlert } from "@/components/ui/status-alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { ticketCategories } from "@/lib/constants/tickets";
import {
  getManagedOptions,
  type ManagedOption,
  type ManagedOptionGroup
} from "@/lib/settings/managed-options";
import type { TicketCategory } from "@/lib/types/tickets";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  createManagedOption,
  toggleManagedOptionStatus,
  updateManagedOption
} from "../actions";

type SettingsOptionsPageProps = {
  searchParams?: {
    error?: string;
    list?: string;
    success?: string;
  };
};

type OptionSection = {
  description: string;
  group: ManagedOptionGroup;
  parentLabel?: TicketCategory;
  title: string;
};

const inputClass =
  "w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20";

const sections: OptionSection[] = [
  {
    group: "lead_product_interest",
    title: "Lead Product Interests",
    description: "These appear under Product interest when adding or editing a lead."
  },
  {
    group: "product_area",
    title: "Product Log Affected Products",
    description: "These appear as affected products when creating or editing Product Log events."
  }
];

const optionTabs = [
  {
    description: "Product interests used in lead forms.",
    group: "lead_product_interest",
    href: "/settings/options?list=lead-products",
    id: "lead-products",
    label: "Lead Products"
  },
  {
    description: "Subcategories linked to Complaint, Request, and Inquiry.",
    group: "ticket_sub_category",
    href: "/settings/options?list=ticket-subcategories",
    id: "ticket-subcategories",
    label: "Ticket Subcategories"
  },
  {
    description: "Affected products used in Product Log events.",
    group: "product_area",
    href: "/settings/options?list=product-log-products",
    id: "product-log-products",
    label: "Product Log Products"
  }
] as const;

function AddOptionForm({ group, parentLabel }: Pick<OptionSection, "group" | "parentLabel">) {
  return (
    <form
      action={createManagedOption}
      className="mt-4 grid gap-3 rounded border border-neutral-200 bg-neutral-50 p-4 md:grid-cols-[1fr_120px_auto]"
    >
      <input type="hidden" name="option_group" value={group} />
      {parentLabel ? (
        <input type="hidden" name="parent_label" value={parentLabel} />
      ) : null}
      <input required name="label" placeholder="New option name" className={inputClass} />
      <input
        name="sort_order"
        type="number"
        min="0"
        step="1"
        placeholder="Order"
        className={inputClass}
      />
      <SubmitButton pendingText="Adding...">Add Option</SubmitButton>
    </form>
  );
}

function OptionTable({
  group,
  options,
  parentLabel,
  tableReady
}: {
  group: ManagedOptionGroup;
  options: ManagedOption[];
  parentLabel?: TicketCategory;
  tableReady: boolean;
}) {
  return (
    <div className="mt-4 overflow-hidden rounded border border-neutral-200 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-200 text-sm">
          <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-3">Option</th>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {options.map((option) => (
              <tr key={option.option_id}>
                <td className="px-4 py-3">
                  <form
                    id={`update-${option.option_id}`}
                    action={updateManagedOption}
                    className="min-w-64"
                  >
                    <input type="hidden" name="option_id" value={option.option_id} />
                    <input type="hidden" name="option_group" value={group} />
                    <input
                      type="hidden"
                      name="parent_label"
                      value={parentLabel ?? option.parent_label ?? ""}
                    />
                    <input
                      required
                      name="label"
                      defaultValue={option.label}
                      disabled={!tableReady}
                      className={inputClass}
                    />
                  </form>
                </td>
                <td className="px-4 py-3">
                  <input
                    form={`update-${option.option_id}`}
                    name="sort_order"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue={option.sort_order}
                    disabled={!tableReady}
                    className="w-24 rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                  />
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded border px-2 py-1 text-xs font-semibold ${
                      option.is_active
                        ? "border-green-200 bg-green-50 text-green-700"
                        : "border-neutral-200 bg-neutral-100 text-neutral-600"
                    }`}
                  >
                    {option.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <SubmitButton form={`update-${option.option_id}`} disabled={!tableReady}>
                      Save
                    </SubmitButton>
                    <form action={toggleManagedOptionStatus}>
                      <input type="hidden" name="option_id" value={option.option_id} />
                      <input
                        type="hidden"
                        name="is_active"
                        value={String(!option.is_active)}
                      />
                      <SubmitButton
                        variant="secondary"
                        pendingText="Updating..."
                        disabled={!tableReady}
                      >
                        {option.is_active ? "Deactivate" : "Activate"}
                      </SubmitButton>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {options.length === 0 ? (
              <EmptyTableRow colSpan={4} message="No options configured yet." />
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function SettingsOptionsPage({
  searchParams
}: SettingsOptionsPageProps) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();

  if (!currentUser.is_super_admin) {
    redirect("/");
  }

  const [leadProductOptions, productAreaOptions, ticketSubCategoryOptions] =
    await Promise.all([
      getManagedOptions(supabase, "lead_product_interest", { activeOnly: false }),
      getManagedOptions(supabase, "product_area", { activeOnly: false }),
      getManagedOptions(supabase, "ticket_sub_category", { activeOnly: false })
    ]);

  const allOptions = [
    ...leadProductOptions,
    ...productAreaOptions,
    ...ticketSubCategoryOptions
  ];
  const tableReady = allOptions.some((option) => option.created_at);
  const optionsByGroup: Record<ManagedOptionGroup, ManagedOption[]> = {
    lead_product_interest: leadProductOptions,
    product_area: productAreaOptions,
    ticket_sub_category: ticketSubCategoryOptions
  };
  const activeTabId = optionTabs.some((tab) => tab.id === searchParams?.list)
    ? searchParams?.list
    : "lead-products";
  const activeTab = optionTabs.find((tab) => tab.id === activeTabId) ?? optionTabs[0];
  const activeStandardSection = sections.find(
    (section) => section.group === activeTab.group
  );

  return (
    <AppShell currentUser={currentUser} permissions={permissions}>
      <section>
        <PageHeader
          eyebrow="Settings"
          title="Option Lists"
          description="Manage reusable CRM lists used by Leads, Tickets, and Product Log forms."
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

        {!tableReady ? (
          <div className="mt-6 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Run `supabase/step-15-managed-option-lists.sql` in Supabase to
            enable editing. The app is currently showing fallback options.
          </div>
        ) : null}

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {optionTabs.map((tab) => {
            const isActive = tab.id === activeTab.id;
            const count = optionsByGroup[tab.group].filter(
              (option) => option.is_active
            ).length;

            return (
              <Link
                key={tab.id}
                href={tab.href}
                className={`rounded border p-4 transition ${
                  isActive
                    ? "border-payscribe-blue bg-blue-50"
                    : "border-neutral-200 bg-white hover:border-payscribe-blue"
                }`}
              >
                <span className="text-sm font-semibold text-neutral-950">
                  {tab.label}
                </span>
                <span className="mt-2 block text-2xl font-semibold text-neutral-950">
                  {count}
                </span>
                <span className="mt-1 block text-xs leading-5 text-neutral-600">
                  {tab.description}
                </span>
              </Link>
            );
          })}
        </div>

        <div className="mt-6">
          {activeStandardSection ? (
            <div className="rounded border border-neutral-200 bg-white p-5">
              <h3 className="text-base font-semibold text-neutral-950">
                {activeStandardSection.title}
              </h3>
              <p className="mt-1 text-sm text-neutral-600">
                {activeStandardSection.description}
              </p>
              <AddOptionForm group={activeStandardSection.group} />
              <OptionTable
                group={activeStandardSection.group}
                options={optionsByGroup[activeStandardSection.group]}
                tableReady={tableReady}
              />
            </div>
          ) : null}

          {activeTab.group === "ticket_sub_category" ? (
            <div className="rounded border border-neutral-200 bg-white p-5">
            <h3 className="text-base font-semibold text-neutral-950">
              Ticket Subcategories
            </h3>
            <p className="mt-1 text-sm text-neutral-600">
              These are linked to the top-level ticket category selected in the
              ticket form.
            </p>
            <div className="mt-5 space-y-5">
              {ticketCategories.map((category) => {
                const options = ticketSubCategoryOptions.filter(
                  (option) => option.parent_label === category
                );

                return (
                  <div key={category} className="rounded border border-neutral-200 p-4">
                    <h4 className="text-sm font-semibold text-neutral-900">
                      {category}
                    </h4>
                    <AddOptionForm
                      group="ticket_sub_category"
                      parentLabel={category}
                    />
                    <OptionTable
                      group="ticket_sub_category"
                      parentLabel={category}
                      options={options}
                      tableReady={tableReady}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          ) : null}
        </div>
      </section>
    </AppShell>
  );
}
