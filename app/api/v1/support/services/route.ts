import { supportJson, supportOptions } from "@/lib/support/api";
import { supportServices } from "@/lib/support/services";

export const dynamic = "force-dynamic";

export async function OPTIONS(request: Request) {
  return supportOptions(request);
}

export async function GET(request: Request) {
  return supportJson(request, supportServices);
}
