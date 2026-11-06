import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { withErrorHandling } from "@/server/http";
import { getCurrentUser } from "@/server/identity/current-user";

/**
 * Who is the caller? Used by the Account menu. Never returns ids: only whether the caller is signed in and, if so, the
 * email they signed in with and their display name (null when the account has none).
 */
export const GET = withErrorHandling(async () => {
  const user = await getCurrentUser();
  if (user.kind !== "authenticated") return Response.json({ state: "anonymous" }, { headers: { "Cache-Control": "no-store" } });
  const row = await (await getDb()).select({ name: users.name }).from(users).where(eq(users.id, user.userId)).get();
  return Response.json(
    { state: "authenticated", email: user.email, name: row?.name?.trim() || null },
    { headers: { "Cache-Control": "no-store" } },
  );
});
