"use server";

import { getCurrentUserContext } from "@/lib/auth/current-user";
import {
  editableProductEventStatuses,
  productEventStatuses,
  productEventTypes,
  severities
} from "@/lib/constants/product-events";
import { hasModulePermission } from "@/lib/permissions/checks";
import { getProductAreaOptions } from "@/lib/settings/managed-options";
import type {
  ProductArea,
  ProductEventStatus,
  Severity
} from "@/lib/types/product-events";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function requiredText(formData: FormData, key: string) {
  return optionalText(formData.get(key));
}

async function validateProductEventForm(
  supabase: Awaited<ReturnType<typeof getCurrentUserContext>>["supabase"],
  formData: FormData,
  redirectPath: string,
  existingAffectedProducts: string[] = []
) {
  const eventType = requiredText(formData, "event_type");
  const title = requiredText(formData, "title");
  const description = requiredText(formData, "description");
  const severity = optionalText(formData.get("severity"));
  const status = requiredText(formData, "status") ?? "Active";
  const productAreaOptions = await getProductAreaOptions(supabase);
  const allowedProductAreas = new Set([
    ...productAreaOptions,
    ...existingAffectedProducts
  ]);
  const affectedProducts = formData
    .getAll("affected_products")
    .map((value) => String(value))
    .filter((value): value is ProductArea =>
      allowedProductAreas.has(value)
    );

  if (!eventType || !title || !description) {
    redirect(
      `${redirectPath}?error=Event%20type,%20title,%20and%20description%20are%20required`
    );
  }

  if (!productEventTypes.includes(eventType as never)) {
    redirect(`${redirectPath}?error=Invalid%20product%20event%20type`);
  }

  if (affectedProducts.length === 0) {
    redirect(`${redirectPath}?error=At%20least%20one%20affected%20product%20is%20required`);
  }

  if (severity && !severities.includes(severity as Severity)) {
    redirect(`${redirectPath}?error=Invalid%20severity`);
  }

  if (eventType === "Unplanned Outage" && !severity) {
    redirect(`${redirectPath}?error=Severity%20is%20required%20for%20unplanned%20outages`);
  }

  if (!productEventStatuses.includes(status as ProductEventStatus)) {
    redirect(`${redirectPath}?error=Invalid%20product%20event%20status`);
  }

  return {
    eventType,
    title,
    description,
    affectedProducts,
    severity: severity as Severity | null,
    status: status as ProductEventStatus
  };
}

export async function createProductEvent(formData: FormData) {
  const { supabase, authUser, currentUser, permissions } =
    await getCurrentUserContext();

  if (
    !hasModulePermission(currentUser, permissions, "Product Log", "can_create")
  ) {
    redirect("/product-log?error=You%20do%20not%20have%20permission%20to%20create%20product%20events");
  }

  const values = await validateProductEventForm(supabase, formData, "/product-log");

  const { data: createdEvent, error } = await supabase
    .from("product_events")
    .insert({
      event_type: values.eventType,
      title: values.title,
      description: values.description,
      affected_products: values.affectedProducts,
      severity: values.severity,
      status: values.status,
      posted_by: authUser.id
    })
    .select("event_id")
    .single<{ event_id: string }>();

  if (error) {
    redirect(`/product-log?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/");
  revalidatePath("/product-log");
  redirect(
    `/product-log?success=Product%20event%20${createdEvent.event_id}%20created`
  );
}

export async function updateProductEvent(formData: FormData) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();
  const eventId = optionalText(formData.get("event_id"));

  if (!eventId) {
    redirect("/product-log?error=Product%20event%20is%20required");
  }

  if (!hasModulePermission(currentUser, permissions, "Product Log", "can_edit")) {
    redirect(`/product-log/${eventId}?error=You%20do%20not%20have%20permission%20to%20edit%20product%20events`);
  }

  const { data: previousEvent } = await supabase
    .from("product_events")
    .select("affected_products")
    .eq("event_id", eventId)
    .maybeSingle<{ affected_products: string[] }>();
  const values = await validateProductEventForm(
    supabase,
    formData,
    `/product-log/${eventId}`,
    previousEvent?.affected_products ?? []
  );

  if (!editableProductEventStatuses.includes(values.status)) {
    redirect(`/product-log/${eventId}?error=Use%20the%20resolve%20confirmation%20action%20to%20resolve%20events`);
  }

  const { error } = await supabase
    .from("product_events")
    .update({
      event_type: values.eventType,
      title: values.title,
      description: values.description,
      affected_products: values.affectedProducts,
      severity: values.severity,
      status: values.status
    })
    .eq("event_id", eventId);

  if (error) {
    redirect(`/product-log/${eventId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/");
  revalidatePath("/product-log");
  revalidatePath(`/product-log/${eventId}`);
  redirect(`/product-log/${eventId}?success=Product%20event%20updated`);
}

export async function resolveProductEvent(formData: FormData) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();
  const eventId = optionalText(formData.get("event_id"));

  if (!eventId) {
    redirect("/product-log?error=Product%20event%20is%20required");
  }

  if (!hasModulePermission(currentUser, permissions, "Product Log", "can_edit")) {
    redirect(`/product-log/${eventId}?error=You%20do%20not%20have%20permission%20to%20resolve%20product%20events`);
  }

  const { error } = await supabase
    .from("product_events")
    .update({ status: "Resolved" })
    .eq("event_id", eventId);

  if (error) {
    redirect(`/product-log/${eventId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/");
  revalidatePath("/product-log");
  revalidatePath(`/product-log/${eventId}`);
  redirect(`/product-log/${eventId}?success=Product%20event%20resolved`);
}
