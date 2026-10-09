import { isHealthy } from "@/server/health/health-check";

// Public on purpose (the deployment pipeline probes it after a release) and therefore minimal: no credentials, no
// versions, no error text, no data. See server/health/health-check.ts.
export const dynamic = "force-dynamic";

export async function GET() {
  const healthy = await isHealthy();
  return Response.json({ status: healthy ? "ok" : "unavailable" }, { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
