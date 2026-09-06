import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseAdmin = ReturnType<typeof createSupabaseAdminClient>;

export const ticketAttachmentBucket = "ticket-attachments";
export const maxTicketAttachmentBytes = 5 * 1024 * 1024;

const allowedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);

export type TicketAttachment = {
  id: string;
  name: string;
  mime_type: string;
  size: number;
  path: string;
};

function safeFileName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "attachment";
}

export function validateTicketAttachment(file: File) {
  if (!allowedTypes.has(file.type)) {
    return "Attach a JPG, PNG, WebP, PDF, TXT, DOC, or DOCX file.";
  }
  if (file.size <= 0 || file.size > maxTicketAttachmentBytes) {
    return "Attachments must be no larger than 5 MB.";
  }
  return null;
}

export async function uploadTicketAttachment({
  file,
  supabase,
  ticketId
}: {
  file: File;
  supabase: SupabaseAdmin;
  ticketId: string;
}): Promise<TicketAttachment> {
  const errorMessage = validateTicketAttachment(file);
  if (errorMessage) throw new Error(errorMessage);

  const id = crypto.randomUUID();
  const path = `${ticketId}/${id}-${safeFileName(file.name)}`;
  const { error } = await supabase.storage
    .from(ticketAttachmentBucket)
    .upload(path, await file.arrayBuffer(), {
      contentType: file.type,
      upsert: false
    });

  if (error) throw new Error(error.message);
  return { id, name: file.name, mime_type: file.type, size: file.size, path };
}

export function parseTicketAttachments(value: unknown): TicketAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is TicketAttachment => {
    if (!item || typeof item !== "object") return false;
    const candidate = item as Partial<TicketAttachment>;
    return Boolean(
      candidate.id && candidate.name && candidate.mime_type &&
      typeof candidate.size === "number" && candidate.path
    );
  });
}

export function ticketAttachmentContentDisposition(
  name: string,
  disposition: "inline" | "attachment"
) {
  const fallback = name
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/["\\]/g, "_")
    .trim() || "attachment";
  const encoded = encodeURIComponent(name).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
