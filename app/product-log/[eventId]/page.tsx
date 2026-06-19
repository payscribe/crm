import { AppShell } from "@/components/app-shell";
import { ResolveProductEventForm } from "@/components/product-log/resolve-product-event-form";
import { StatusAlert } from "@/components/ui/status-alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import {
  editableProductEventStatuses,
  productEventTypes,
  severities
} from "@/lib/constants/product-events";
import { formatDate } from "@/lib/format/date";
import { hasModulePermission } from "@/lib/permissions/checks";
import { getHistoricalAwareProductAreaOptions } from "@/lib/settings/managed-options";
import type { ProductEvent } from "@/lib/types/product-events";
import type { StaffUser } from "@/lib/types/users";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { updateProductEvent } from "../actions";

type ProductEventDetailPageProps = {
  params: {
    eventId: string;
  };
  searchParams?: {
    error?: string;
    success?: string;
  };
};

export default async function ProductEventDetailPage({
  params,
  searchParams
}: ProductEventDetailPageProps) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();

  if (
    !hasModulePermission(currentUser, permissions, "Product Log", "can_view")
  ) {
    redirect("/");
  }

  const canEdit = hasModulePermission(
    currentUser,
    permissions,
    "Product Log",
    "can_edit"
  );

  const [
    { data: productEvent },
    { data: staffMembers },
    productAreaOptionState
  ] = await Promise.all([
    supabase
      .from("product_events")
      .select("*")
      .eq("event_id", params.eventId)
      .single<ProductEvent>(),
    supabase.from("users").select("*").returns<StaffUser[]>(),
    supabase
      .from("product_events")
      .select("affected_products")
      .eq("event_id", params.eventId)
      .single<{ affected_products: string[] }>()
      .then(({ data }) =>
        getHistoricalAwareProductAreaOptions(
          supabase,
          data?.affected_products ?? []
        )
      )
  ]);

  if (!productEvent) {
    notFound();
  }

  const staffById = new Map(
    (staffMembers ?? []).map((staffMember) => [
      staffMember.user_id,
      staffMember.full_name
    ])
  );
  const disabled = !canEdit || productEvent.status === "Resolved";
  const inputClass =
    "mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20 disabled:bg-neutral-100 disabled:text-neutral-500";
  const selectClass =
    "mt-2 w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20 disabled:bg-neutral-100 disabled:text-neutral-500";

  return (
    <AppShell currentUser={currentUser} permissions={permissions}>
      <section>
        <div className="flex flex-col gap-4 border-b border-neutral-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-payscribe-blue">
              {productEvent.event_id}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-normal text-neutral-950">
              {productEvent.title}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
              {productEvent.event_type} - Posted by{" "}
              {staffById.get(productEvent.posted_by) ?? "Unknown"}
            </p>
          </div>
          <Link
            href="/product-log"
            className="rounded border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 transition hover:border-payscribe-blue hover:text-payscribe-blue"
          >
            Back to Product Log
          </Link>
        </div>

        <StatusAlert type="error" message={searchParams?.error} />
        <StatusAlert type="success" message={searchParams?.success} />

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <div className="rounded border border-neutral-200 bg-white p-5">
            <p className="text-sm font-medium text-neutral-500">Status</p>
            <p className="mt-2 text-xl font-semibold text-neutral-950">
              {productEvent.status}
            </p>
          </div>
          <div className="rounded border border-neutral-200 bg-white p-5">
            <p className="text-sm font-medium text-neutral-500">Severity</p>
            <p className="mt-2 text-xl font-semibold text-neutral-950">
              {productEvent.severity ?? "Not set"}
            </p>
          </div>
          <div className="rounded border border-neutral-200 bg-white p-5">
            <p className="text-sm font-medium text-neutral-500">Created</p>
            <p className="mt-2 text-xl font-semibold text-neutral-950">
              {formatDate(productEvent.created_at)}
            </p>
          </div>
          <div className="rounded border border-neutral-200 bg-white p-5">
            <p className="text-sm font-medium text-neutral-500">Resolved</p>
            <p className="mt-2 text-xl font-semibold text-neutral-950">
              {productEvent.resolved_at
                ? `${formatDate(productEvent.resolved_at)} (${productEvent.resolution_time_hours ?? "?"}h)`
                : "Not resolved"}
            </p>
          </div>
        </div>

        {!canEdit ? (
          <div className="mt-6 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            You can view this record, but you do not have edit permission for
            Product Log.
          </div>
        ) : null}

        {productEvent.status === "Resolved" ? (
          <div className="mt-6 rounded border border-neutral-200 bg-neutral-100 px-4 py-3 text-sm text-neutral-700">
            This event is resolved and cannot be edited.
          </div>
        ) : null}

        <form
          action={updateProductEvent}
          className="mt-6 rounded border border-neutral-200 bg-white p-5"
        >
          <input type="hidden" name="event_id" value={productEvent.event_id} />

          <div>
            <h3 className="text-base font-semibold text-neutral-950">
              Event Details
            </h3>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Event type
              </span>
              <select
                required
                disabled={disabled}
                name="event_type"
                defaultValue={productEvent.event_type}
                className={selectClass}
              >
                {productEventTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
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
                disabled={disabled}
                name="title"
                defaultValue={productEvent.title}
                className={inputClass}
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Severity
              </span>
              <select
                disabled={disabled}
                name="severity"
                defaultValue={productEvent.severity ?? ""}
                className={selectClass}
              >
                <option value="">No severity</option>
                {severities.map((severity) => (
                  <option key={severity} value={severity}>
                    {severity}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-800">
                Status
              </span>
              <select
                required
                disabled={disabled}
                name="status"
                defaultValue={productEvent.status}
                className={selectClass}
              >
                {editableProductEventStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <fieldset className="mt-5" disabled={disabled}>
            <legend className="text-sm font-medium text-neutral-800">
              Affected products
            </legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {productAreaOptionState.labels.map((area) => {
                const isInactive =
                  productEvent.affected_products.includes(area) &&
                  !productAreaOptionState.activeLabels.includes(area);

                return (
                <label
                  key={area}
                  className="flex items-center gap-2 rounded border border-neutral-200 px-3 py-2 text-sm text-neutral-700"
                >
                  <input
                    type="checkbox"
                    name="affected_products"
                    value={area}
                    defaultChecked={productEvent.affected_products.includes(
                      area
                    )}
                    className="h-4 w-4 accent-payscribe-blue"
                  />
                  <span>
                    {area}
                    {isInactive ? (
                      <span className="ml-2 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700">
                        Inactive
                      </span>
                    ) : null}
                  </span>
                </label>
                );
              })}
            </div>
          </fieldset>

          <label className="mt-5 block">
            <span className="text-sm font-medium text-neutral-800">
              Description
            </span>
            <textarea
              required
              disabled={disabled}
              name="description"
              rows={5}
              defaultValue={productEvent.description}
              className="mt-2 w-full rounded border border-neutral-300 px-3 py-2 text-sm outline-none transition focus:border-payscribe-blue focus:ring-2 focus:ring-payscribe-blue/20 disabled:bg-neutral-100 disabled:text-neutral-500"
            />
          </label>

          {canEdit && productEvent.status !== "Resolved" ? (
            <div className="mt-5 flex justify-end">
              <SubmitButton pendingText="Saving event...">
                Save Event
              </SubmitButton>
            </div>
          ) : null}
        </form>

        {productEvent.status !== "Resolved" ? (
          <div className="mt-6 rounded border border-neutral-200 bg-white p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-base font-semibold text-neutral-950">
                  Resolve Event
                </h3>
                <p className="mt-1 text-sm text-neutral-600">
                  The database will record resolved time and resolution duration
                  automatically.
                </p>
              </div>
              <ResolveProductEventForm
                eventId={productEvent.event_id}
                eventTitle={productEvent.title}
                canEdit={canEdit}
              />
            </div>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
