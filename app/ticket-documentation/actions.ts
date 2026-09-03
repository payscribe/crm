"use server";

import { getCurrentUserContext } from "@/lib/auth/current-user";
import { hasModulePermission } from "@/lib/permissions/checks";
import { richTextPlainText, sanitizeRichTextHtml } from "@/lib/rich-text";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function text(value: FormDataEntryValue | null) {
  const result = String(value ?? "").trim();
  return result || null;
}

export async function saveTicketDocumentation(formData: FormData) {
  const { supabase, currentUser, permissions } = await getCurrentUserContext();
  const ticketId = text(formData.get("ticket_id"));
  const ticketPath = ticketId ? `/tickets/${ticketId}` : "/tickets";

  if (!hasModulePermission(currentUser, permissions, "Tickets", "can_edit")) {
    redirect(`${ticketPath}?error=${encodeURIComponent("You do not have permission to document tickets")}`);
  }

  if (!ticketId) {
    redirect("/tickets?error=Ticket%20is%20required");
  }

  const title = text(formData.get("title"));
  const contentHtml = sanitizeRichTextHtml(String(formData.get("content_html") ?? ""));
  if (!title || !richTextPlainText(contentHtml)) {
    redirect(`${ticketPath}?error=${encodeURIComponent("Documentation title and content are required")}`);
  }

  const { data: ticket } = await supabase
    .from("tickets")
    .select("ticket_id")
    .eq("ticket_id", ticketId)
    .maybeSingle<{ ticket_id: string }>();
  if (!ticket) {
    redirect("/tickets?error=Ticket%20not%20found");
  }

  const { data: existing } = await supabase
    .from("ticket_documentation")
    .select("documentation_id")
    .eq("ticket_id", ticketId)
    .maybeSingle<{ documentation_id: string }>();

  const { error } = existing
    ? await supabase
        .from("ticket_documentation")
        .update({ title, content_html: contentHtml, updated_by: currentUser.user_id })
        .eq("documentation_id", existing.documentation_id)
    : await supabase.from("ticket_documentation").insert({
        ticket_id: ticketId,
        title,
        content_html: contentHtml,
        created_by: currentUser.user_id,
        updated_by: currentUser.user_id
      });

  if (error) {
    redirect(`${ticketPath}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(ticketPath);
  revalidatePath("/ticket-documentation");
  redirect(`${ticketPath}?success=${encodeURIComponent("Ticket documentation saved")}`);
}
