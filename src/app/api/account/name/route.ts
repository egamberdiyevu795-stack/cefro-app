import { saveName } from "@/server/account/account-store";
import { HttpError } from "@/server/errors";
import { withErrorHandling } from "@/server/http";
import { requireAuthenticated } from "@/server/identity/current-user";

/**
 * The signed-in account's display name (Profile). `PUT { "name": "…" }`: 1–50 characters after trimming. Always the
 * caller's own account (never an id from the request); 401 when not signed in. The email cannot be changed here.
 */
export const PUT = withErrorHandling(async (request: Request) => {
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  if (!body || typeof body !== "object") throw new HttpError(400, "invalid_body", "Enter your name.");
  const user = await requireAuthenticated();
  const name = await saveName(user.userId, body.name);
  return Response.json({ name }, { headers: { "Cache-Control": "no-store" } });
});
