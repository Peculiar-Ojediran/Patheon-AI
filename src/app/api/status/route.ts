import { getResearchConfiguration } from "@/lib/research-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const { configured, model, requiresUserKey } = getResearchConfiguration();
  return Response.json(
    { configured, model, requiresUserKey },
    { headers: { "Cache-Control": "no-store" } },
  );
}
