import { verifyLeadEmailSyncRequest } from "@/lib/email/google-script-auth";
import { parseSyncPayload, recordSyncedLeadEmails } from "@/lib/leads/email-sync";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rejected = verifyLeadEmailSyncRequest(request);
  if (rejected) return rejected;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseSyncPayload(payload);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const result = await recordSyncedLeadEmails({
      supabase: createSupabaseAdminClient(),
      mailbox: process.env.LEAD_EMAIL_MAILBOX ?? "",
      messages: parsed.messages,
      completedBackfills: parsed.completedBackfills
    });
    if (result.logged > 0) {
      revalidatePath("/leads", "layout");
      revalidatePath("/");
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to log lead emails" },
      { status: 500 }
    );
  }
}
