import { verifyLeadEmailSyncRequest } from "@/lib/email/google-script-auth";
import { listLeadsForEmailSync } from "@/lib/leads/email-sync";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Lead addresses the sales mailbox script should watch. historySynced is false
// when a lead's email is new or changed and its past emails need importing.
export async function GET(request: Request) {
  const rejected = verifyLeadEmailSyncRequest(request);
  if (rejected) return rejected;
  try {
    const leads = await listLeadsForEmailSync(createSupabaseAdminClient({ noStore: true }));
    return NextResponse.json({ leads }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to read leads" }, { status: 500 });
  }
}
