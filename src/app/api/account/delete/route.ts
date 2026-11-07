import { cookies, headers } from "next/headers";
import { APIError } from "better-auth/api";
import { isDeleteConfirmed } from "@/domain/account";
import { deleteAccount } from "@/server/account/delete-account";
import { getAuth } from "@/server/auth/auth";
import { clientIp, countPasswordFailure, passwordFailureBlocked } from "@/server/auth/auth-limits";
import { HttpError } from "@/server/errors";
import { errorResponse, isCrossSite, withErrorHandling } from "@/server/http";
import { requireAuthenticated } from "@/server/identity/current-user";
import { SESSION_COOKIE_NAMES, USER_COOKIE_NAME } from "@/server/identity/user-cookie";
import { logger } from "@/server/logging/logger";

/**
 * "Delete my account" (Account page). `POST { "password": "…", "confirm": "DELETE" }`, signed in only, the caller's own
 * account. The password is checked by the auth library (wrong ones count like failed sign-ins, per email), then
 * everything is deleted (server/account/delete-account.ts), audio included, and this browser's cookies are cleared.
 * Cross-site requests are refused; anything but "DELETE", or a wrong password, is a 400 and deletes nothing.
 */
export const POST = withErrorHandling(async (request: Request) => {
  if (isCrossSite(request)) return errorResponse(403, "cross_site_request", "This request was not made from CEFRO.");
  const user = await requireAuthenticated();
  const body = (await request.json().catch(() => null)) as { confirm?: unknown; password?: unknown } | null;
  if (!isDeleteConfirmed(body?.confirm)) throw new HttpError(400, "not_confirmed", "Type DELETE to confirm.");
  const password = typeof body?.password === "string" ? body.password : "";
  if (!password) throw new HttpError(400, "password_required", "Enter your password.");

  const ip = clientIp(request);
  const blocked = passwordFailureBlocked(user.email, ip);
  if (blocked.blocked) {
    return errorResponse(429, "password_rate_limited", "Too many wrong passwords. Please wait a few minutes and try again.", blocked.retryAfterSeconds);
  }
  try {
    await (await getAuth()).api.verifyPassword({ body: { password }, headers: await headers() });
  } catch (error) {
    if (error instanceof APIError) {
      countPasswordFailure(user.email, ip);
      throw new HttpError(400, "wrong_password", "Your password is not right.");
    }
    throw error;
  }

  const summary = await deleteAccount(user.userId);
  logger.info("Account deleted", { ...summary });

  const jar = await cookies();
  for (const name of [...SESSION_COOKIE_NAMES, USER_COOKIE_NAME]) jar.set(name, "", { maxAge: 0, path: "/", secure: name.startsWith("__Secure-") || undefined });
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
});
