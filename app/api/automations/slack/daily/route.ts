import { runDailySlackAutomations } from "@/lib/automations/daily-slack-runner";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await runDailySlackAutomations();

  return NextResponse.json({
    ok: true,
    ranAt: new Date().toISOString(),
    schedule: "Daily at 09:00 Africa/Lagos",
    ...result
  });
}
