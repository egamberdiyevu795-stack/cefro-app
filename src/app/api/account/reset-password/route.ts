import { newPasswordProblem } from "@/domain/account";
import { authLimiters, clientIp } from "@/server/auth/auth-limits";
import { callAuthLibrary } from "@/server/auth/library-request";
import { errorResponse, isCrossSite, withErrorHandling } from "@/server/http";
import { logger } from "@/server/logging/logger";

/**
 * "Forgot password", step 2. `POST { "token", "newPassword" }` from /reset-password (the link in the email). The auth
 * library checks the token (one use, 60 minutes), hashes the new password, ends every session of the account (it is
 * signed out everywhere) and the account's wrong-password lock is lifted. The student then signs in as usual.
 *
 *  - 400 `invalid_new_password`: too short or too long (same rules as Create account).
 *  - 400 `invalid_token`: unknown, used or expired link.
 *  - 429 `reset_rate_limited`: 30 attempts per client IP per 15 minutes.
 */
const MAX_TOKEN_LENGTH = 200;

export const POST = withErrorHandling(async (request: Request) => {
  if (isCrossSite(request)) return errorResponse(403, "cross_site_request", "This request was not made from CEFRO.");
  const body = (await request.json().catch(() => null)) as { token?: unknown; newPassword?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const problem = newPasswordProblem(body?.newPassword);
  if (problem) return errorResponse(400, "invalid_new_password", problem);
  const state = authLimiters().resetPasswordByIp.hit(clientIp(request));
  if (!state.allowed) return errorResponse(429, "reset_rate_limited", "Too many tries. Please wait a few minutes and try again.", state.retryAfterSeconds);
  if (!token || token.length > MAX_TOKEN_LENGTH) return invalidToken();

  const response = await callAuthLibrary(request, "/reset-password", { token, newPassword: body!.newPassword });
  if (response.ok) return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  if (response.status === 400) return invalidToken();
  logger.error("Password reset failed in the auth library", { status: response.status });
  return errorResponse(500, "internal_error", "Something went wrong. Please try again.");
});

function invalidToken() {
  return errorResponse(400, "invalid_token", "This link has expired or was already used. Ask for a new one.");
}
