"use server";

import { getCurrentUserContext } from "@/lib/auth/current-user";
import { entityDetailPath } from "@/lib/activity/entity-links";
import { hasModulePermission } from "@/lib/permissions/checks";
import type { CrmRecordType } from "@/lib/types/activity";
import type { CrmModule } from "@/lib/types/permissions";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const moduleForEntityType: Record<CrmRecordType, CrmModule> = {
  Business: "Businesses",
  Lead: "Leads",
  Partner: "Partners",
  Ticket: "Tickets",
  "Product Event": "Product Log"
};

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

export async function logActivity(formData: FormData) {
  const { supabase, authUser, currentUser, permissions } =
    await getCurrentUserContext();

  const entityType = optionalText(
    formData.get("entity_type")
  ) as CrmRecordType | null;
  const entityId = optionalText(formData.get("entity_id"));
  const summary = optionalText(formData.get("summary"));

  if (!entityType || !entityId || !summary) {
    redirect("/?error=Entity%20and%20summary%20are%20required");
  }

  const crmModule = moduleForEntityType[entityType];
  const returnTo = entityDetailPath(entityType, entityId);

  if (!hasModulePermission(currentUser, permissions, crmModule, "can_create")) {
    redirect(
      `${returnTo}?error=You%20do%20not%20have%20permission%20to%20log%20activity`
    );
  }

  const { error } = await supabase.from("activity_log").insert({
    entity_type: entityType,
    entity_id: entityId,
    summary,
    channel: optionalText(formData.get("channel")),
    direction: optionalText(formData.get("direction")),
    created_by: authUser.id
  });

  if (error) {
    redirect(`${returnTo}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(returnTo);
  redirect(`${returnTo}?success=Activity%20logged`);
}
