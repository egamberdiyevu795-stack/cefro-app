import { headers } from "next/headers";
import { APIError } from "better-auth/api";
import { newPasswordProblem } from "@/domain/account";
import { getAuth } from "@/server/auth/auth";
import { clientIp, countPasswordFailure, passwordFailureBlocked } from "@/server/auth/auth-limits";
import { HttpError } from "@/server/errors";
import { errorResponse, isCrossSite, withErrorHandling } from "@/server/http";
import { requireAuthenticated } from "@/server/identity/current-user";

/**
 * Change password (Settings). `POST { "currentPassword", "newPassword" }`, signed in only. The auth library checks the
 * current password and hashes the new one; every other session of the account is ended (other devices are signed
 * out) and this browser gets a fresh session cookie. Wrong current passwords count towards the same per-email limit
 * as failed sign-ins, so this cannot be used to guess a password. Cross-site requests are refused.
 */
export const POST = withErrorHandling(async (request: Request) => {
  if (isCrossSite(request)) return errorResponse(403, "cross_site_request", "This request was not made from CEFRO.");
  const user = await requireAuthenticated();
  const body = (await request.json().catch(() => null)) as { currentPassword?: unknown; newPassword?: unknown } | null;
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  if (!currentPassword) throw new HttpError(400, "invalid_body", "Enter your current password.");
  const problem = newPasswordProblem(body?.newPassword);
  if (problem) throw new HttpError(400, "invalid_new_password", problem);

  const ip = clientIp(request);
  const blocked = passwordFailureBlocked(user.email, ip);
  if (blocked.blocked) {
    return errorResponse(429, "password_rate_limited", "Too many wrong passwords. Please wait a few minutes and try again.", blocked.retryAfterSeconds);
  }

  try {
    const { headers: set } = await (await getAuth()).api.changePassword({
      body: { currentPassword, newPassword: body!.newPassword as string, revokeOtherSessions: true },
      headers: await headers(),
      returnHeaders: true,
    });
    const response = new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
    for (const cookie of set.getSetCookie()) response.headers.append("Set-Cookie", cookie);
    return response;
  } catch (error) {
    if (error instanceof APIError && (error.body?.code === "INVALID_PASSWORD" || error.status === "BAD_REQUEST")) {
      countPasswordFailure(user.email, ip);
      throw new HttpError(400, "wrong_password", "Your current password is not right.");
    }
    throw error;
  }
});
