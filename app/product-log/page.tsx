import { AppShell } from "@/components/app-shell";
import { EmptyTableRow } from "@/components/ui/empty-table-row";
import { FormModal } from "@/components/ui/form-modal";
import { MetricCard } from "@/components/ui/metric-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatusAlert } from "@/components/ui/status-alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import {
  productEventStatuses,
  productEventTypes,
  severities
} from "@/lib/constants/product-events";
import { formatDate } from "@/lib/format/date";
import { hasModulePermission } from "@/lib/permissions/checks";
import { getProductAreaOptions } from "@/lib/settings/managed-options";
import type {
  ProductEvent,
  ProductEventStatus,
  ProductEventType,
  Severity
} from "@/lib/types/product-events";
import type { StaffUser } from "@/lib/types/users";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createProductEvent } from "./actions";

type ProductLogPageProps = {
  searchParams?: {
    q?: string;
    event_type?: string;
    status?: string;
    severity?: string;
    error?: string;
    success?: string;
  };
};

export default async function ProductLogPage({
  searchParams
}: ProductLogPageProps) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();

  if (
    !hasModulePermission(currentUser, permissions, "Product Log", "can_view")
  ) {
    redirect("/");
  }

  const canCreate = hasModulePermission(
    currentUser,
    permissions,
    "Product Log",
    "can_create"
  );

  const query = searchParams?.q?.trim() ?? "";
  const eventType = searchParams?.event_type ?? "";
  const status = searchParams?.status ?? "";
  const severity = searchParams?.severity ?? "";

  let eventsQuery = supabase.from("product_events").select("*");

  if (query) {
    eventsQuery = eventsQuery.or(
      `event_id.ilike.%${query}%,title.ilike.%${query}%,description.ilike.%${query}%`
    );
  }

  if (productEventTypes.includes(eventType as ProductEventType)) {
    eventsQuery = eventsQuery.eq("event_type", eventType);
  }

  if (productEventStatuses.includes(status as ProductEventStatus)) {
    eventsQuery = eventsQuery.eq("status", status);
  }

  if (severities.includes(severity as Severity)) {
    eventsQuery = eventsQuery.eq("severity", severity);
  }

  const [{ data: events }, { data: staffMembers }, productAreaOptions] = await Promise.all([
    eventsQuery.order("created_at", { ascending: false }).returns<ProductEvent[]>(),
    supabase.from("users").select("*").returns<StaffUser[]>(),
    getProductAreaOptions(supabase)
  ]);

  const records = events ?? [];
  const staffById = new Map(
    (staffMembers ?? []).map((staffMember) => [
      staffMember.user_id,
      staffMember.full_name
    ])
  );
  const activeEvents = records.filter((event) => event.status === "Active");
  const monitoringEvents = records.filter(
    (event) => event.status === "Monitoring"
  );
  const unresolvedOutages = records.filter(
    (event) =>
      event.event_type === "Unplanned Outage" &&
      event.status !== "Resolved"
  );
  const highCriticalEvents = records.filter((event) =>
    ["High", "Critical"].includes(event.severity ?? "")
  );

  return (
    <AppShell currentUser={currentUser} permissions={permissions}>
      <section>
        <PageHeader
          eyebrow="Product Log"
          title="Platform Events"
          description="Record launches, fixes, maintenance, outages, security patches, and platform updates."
        />

        <StatusAlert type="error" message={searchParams?.error} />
        <StatusAlert type="success" message={searchParams?.success} />

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Active", activeEvents.length],
            ["Monitoring", monitoringEvents.length],
            ["Unresolved Outages", unresolvedOutages.length],
            ["High/Critical", highCriticalEvents.length]
          ].map(([label, value]) => (
            <MetricCard
              key={label}
              label={String(label)}
              value={value}
              density="compact"
            />
          ))}
        </div>

        {canCreate ? (
          <div className="mt-6 flex justify-end">
            <FormModal
              buttonLabel="Add New Event"
              title="New Product Event"
              description="Severity is required for unplanned outages."
            >
              <form action={createProductEvent}>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="block">
                <span className="text-sm font-medium text-neutral-800">
                  Event type
                </span>
                <select
                  required
                  name="event_type"
                  className="mt-2 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                >
                  <option value="">Select type</option>
                  {productEventTypes.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block md:col-span-2">
                <span className="text-sm font-medium text-neutral-800">
                  Title
                </span>
                <input
                  required
                  name="title"
                  className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-neutral-800">
                  Severity
                </span>
                <select
                  name="severity"
                  className="mt-2 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
                >
                  <option value="">No severity</option>
                  {severities.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <fieldset className="mt-5">
              <legend className="text-sm font-medium text-neutral-800">
                Affected products
              </legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {productAreaOptions.map((area) => (
                  <label
                    key={area}
                    className="flex items-center gap-2 rounded border border-neutral-200 px-3 py-2 text-sm text-neutral-700"
                  >
                    <input
                      type="checkbox"
                      name="affected_products"
                      value={area}
                      className="h-4 w-4 accent-payscribe-blue"
                    />
                    <span>{area}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="mt-5 block">
              <span className="text-sm font-medium text-neutral-800">
                Description
              </span>
              <textarea
                required
                name="description"
                rows={3}
                className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
              />
            </label>

            <div className="mt-5 flex justify-end">
              <SubmitButton pendingText="Saving event...">
                Save Event
              </SubmitButton>
            </div>
              </form>
            </FormModal>
          </div>
        ) : null}

        <div className="mt-6 rounded border border-neutral-200 bg-white p-4">
          <form className="grid gap-3 lg:grid-cols-[1fr_200px_180px_180px_auto]">
            <input
              name="q"
              defaultValue={query}
              placeholder="Search by event ID, title, or description"
              className="rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
            />
            <select
              name="event_type"
              defaultValue={eventType}
              className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
            >
              <option value="">All types</option>
              {productEventTypes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              name="status"
              defaultValue={status}
              className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
            >
              <option value="">All statuses</option>
              {productEventStatuses.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              name="severity"
              defaultValue={severity}
              className="rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20"
            >
              <option value="">All severities</option>
              {severities.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <SubmitButton variant="dark" pendingText="Filtering...">
              Filter
            </SubmitButton>
          </form>
        </div>

        <div className="mt-6 overflow-hidden rounded border border-neutral-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Posted By</th>
                  <th className="px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {records.map((event) => (
                  <tr key={event.event_id}>
                    <td className="px-4 py-4">
                      <Link
                        href={`/product-log/${event.event_id}`}
                        className="font-semibold text-payscribe-blue hover:underline"
                      >
                        {event.title}
                      </Link>
                      <div className="mt-1 text-xs text-neutral-500">
                        {event.event_id}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {event.event_type}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {event.severity ?? "Not set"}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {event.status}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {staffById.get(event.posted_by) ?? "Unknown"}
                    </td>
                    <td className="px-4 py-4 text-neutral-700">
                      {formatDate(event.created_at)}
                    </td>
                  </tr>
                ))}

                {records.length === 0 ? (
                  <EmptyTableRow colSpan={6} message="No product events found." />
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
