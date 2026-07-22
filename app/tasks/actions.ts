"use server";

import { getCurrentUserContext } from "@/lib/auth/current-user";
import type { CrmRecordType } from "@/lib/types/activity";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function requiredText(formData: FormData, key: string) {
  return optionalText(formData.get(key));
}

export async function createTask(formData: FormData) {
  const { supabase, authUser } = await getCurrentUserContext();

  const title = requiredText(formData, "title");
  const dueDate = requiredText(formData, "due_date");
  const returnTo = optionalText(formData.get("return_to")) ?? "/tasks";

  if (!title || !dueDate) {
    redirect(`${returnTo}?error=Title%20and%20due%20date%20are%20required`);
  }

  const entityType = optionalText(
    formData.get("entity_type")
  ) as CrmRecordType | null;
  const entityId = optionalText(formData.get("entity_id"));
  const assignedTo = optionalText(formData.get("assigned_to")) ?? authUser.id;

  const { error } = await supabase.from("tasks").insert({
    title,
    notes: optionalText(formData.get("notes")),
    entity_type: entityType,
    entity_id: entityType ? entityId : null,
    assigned_to: assignedTo,
    due_date: dueDate,
    created_by: authUser.id
  });

  if (error) {
    redirect(`${returnTo}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/tasks");
  if (returnTo !== "/tasks") {
    revalidatePath(returnTo);
  }
  redirect(`${returnTo}?success=Task%20created`);
}

export async function completeTask(formData: FormData) {
  const { supabase } = await getCurrentUserContext();
  const taskId = optionalText(formData.get("task_id"));
  const returnTo = optionalText(formData.get("return_to")) ?? "/tasks";

  if (!taskId) {
    redirect(`${returnTo}?error=Task%20is%20required`);
  }

  const { error } = await supabase
    .from("tasks")
    .update({ status: "Done", completed_at: new Date().toISOString() })
    .eq("task_id", taskId);

  if (error) {
    redirect(`${returnTo}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/tasks");
  redirect(`${returnTo}?success=Task%20marked%20done`);
}

export async function cancelTask(formData: FormData) {
  const { supabase } = await getCurrentUserContext();
  const taskId = optionalText(formData.get("task_id"));
  const returnTo = optionalText(formData.get("return_to")) ?? "/tasks";

  if (!taskId) {
    redirect(`${returnTo}?error=Task%20is%20required`);
  }

  const { error } = await supabase
    .from("tasks")
    .update({ status: "Cancelled" })
    .eq("task_id", taskId);

  if (error) {
    redirect(`${returnTo}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/tasks");
  redirect(`${returnTo}?success=Task%20cancelled`);
}
