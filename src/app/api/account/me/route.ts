import { withErrorHandling } from "@/server/http";
import { getCurrentUser } from "@/server/identity/current-user";

/**
 * Who is the caller? Used by the page header. Never returns ids: only whether the caller is signed in and, if so, the
 * email they signed in with.
 */
export const GET = withErrorHandling(async () => {
  const user = await getCurrentUser();
  return Response.json(
    user.kind === "authenticated" ? { state: "authenticated", email: user.email } : { state: "anonymous" },
    { headers: { "Cache-Control": "no-store" } },
  );
});
