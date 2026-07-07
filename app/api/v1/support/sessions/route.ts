import {
  isValidSessionId,
  normalizeMerchantId,
  normalizeText,
  supportJson,
  supportOptions
} from "@/lib/support/api";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type WidgetSessionPayload = {
  session_id?: unknown;
  merchant_id?: unknown;
  last_step_completed?: unknown;
  completed?: unknown;
  ticket_reference?: unknown;
  metadata?: unknown;
};

export async function OPTIONS(request: Request) {
  return supportOptions(request);
}

export async function POST(request: Request) {
  let payload: WidgetSessionPayload;

  try {
    payload = (await request.json()) as WidgetSessionPayload;
  } catch {
    return supportJson(request, { error: "Invalid JSON payload" }, { status: 400 });
  }

  const sessionId = normalizeText(payload.session_id);
  const merchantId = normalizeMerchantId(payload.merchant_id);
  const lastStepCompleted = normalizeText(payload.last_step_completed) ?? "opened";
  const ticketReference = normalizeText(payload.ticket_reference);
  const metadata =
    payload.metadata &&
    typeof payload.metadata === "object" &&
    !Array.isArray(payload.metadata)
      ? payload.metadata
      : {};

  if (!sessionId || !isValidSessionId(sessionId)) {
    return supportJson(
      request,
      { error: "session_id must be 8-120 URL-safe characters" },
      { status: 400 }
    );
  }

  if (!merchantId) {
    return supportJson(request, { error: "merchant_id is required" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: business, error: businessError } = await supabase
    .from("businesses")
    .select("business_id")
    .eq("business_id", merchantId)
    .maybeSingle<{ business_id: string }>();

  if (businessError) {
    return supportJson(request, { error: businessError.message }, { status: 500 });
  }

  if (!business) {
    return supportJson(request, { error: "Merchant not found" }, { status: 404 });
  }

  const { error } = await supabase.from("support_widget_sessions").upsert(
    {
      session_id: sessionId,
      merchant_id: business.business_id,
      last_step_completed: lastStepCompleted,
      completed: payload.completed === true,
      ticket_reference: ticketReference,
      metadata
    },
    { onConflict: "session_id" }
  );

  if (error) {
    return supportJson(request, { error: error.message }, { status: 500 });
  }

  return supportJson(request, { ok: true });
}
