import { cookies } from "next/headers";
import { isDeleteConfirmed } from "@/domain/account";
import { deleteAccount } from "@/server/account/delete-account";
import { HttpError } from "@/server/errors";
import { errorResponse, isCrossSite, withErrorHandling } from "@/server/http";
import { requireAuthenticated } from "@/server/identity/current-user";
import { SESSION_COOKIE_NAMES, USER_COOKIE_NAME } from "@/server/identity/user-cookie";
import { logger } from "@/server/logging/logger";

/**
 * "Delete my account" (Settings). `POST { "confirm": "DELETE" }`, signed in only, the caller's own account. Deletes
 * everything (server/account/delete-account.ts), audio included, then clears this browser's cookies. Cross-site
 * requests are refused; anything but "DELETE" is a 400 and deletes nothing.
 */
export const POST = withErrorHandling(async (request: Request) => {
  if (isCrossSite(request)) return errorResponse(403, "cross_site_request", "This request was not made from CEFRO.");
  const user = await requireAuthenticated();
  const body = (await request.json().catch(() => null)) as { confirm?: unknown } | null;
  if (!isDeleteConfirmed(body?.confirm)) throw new HttpError(400, "not_confirmed", "Type DELETE to confirm.");

  const summary = await deleteAccount(user.userId);
  logger.info("Account deleted", { ...summary });

  const jar = await cookies();
  for (const name of [...SESSION_COOKIE_NAMES, USER_COOKIE_NAME]) jar.set(name, "", { maxAge: 0, path: "/", secure: name.startsWith("__Secure-") || undefined });
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
});
