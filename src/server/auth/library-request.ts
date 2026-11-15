import "server-only";
import { getAuth } from "@/server/auth/auth";
import { getEnv } from "@/server/config/env";

/**
 * Calls one of the auth library's endpoints from a CEFRO route, as a same-origin JSON POST on this site's own origin
 * (APP_URL, or the request's when unset). The library then builds its links on that origin and its origin check passes.
 * Used for the endpoints that /api/auth does not expose (see api/auth/[...all]/route.ts).
 */
export async function callAuthLibrary(original: Request, path: string, body: unknown): Promise<Response> {
  const env = getEnv();
  const origin = env.APP_URL ? new URL(env.APP_URL).origin : new URL(original.url).origin;
  const headers = new Headers({ "content-type": "application/json", origin });
  for (const name of ["x-real-ip", "x-forwarded-for", "user-agent"]) {
    const value = original.headers.get(name);
    if (value) headers.set(name, value);
  }
  const request = new Request(`${origin}/api/auth${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  return (await getAuth()).handler(request);
}
