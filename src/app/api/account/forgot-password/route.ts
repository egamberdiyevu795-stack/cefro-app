import { authLimiters, clientIp } from "@/server/auth/auth-limits";
import { callAuthLibrary } from "@/server/auth/library-request";
import { emailAvailable } from "@/server/email/email";
import { errorResponse, isCrossSite, withErrorHandling } from "@/server/http";
import { logger } from "@/server/logging/logger";

/**
 * "Forgot password", step 1. `POST { "email" }`, signed in or not. When the address belongs to an account, the auth
 * library makes a one-time token and server/auth/password-reset.ts emails the link to /reset-password. The answer is the
 * same `{ "ok": true }` whether or not the address has an account, so this cannot be used to find out who is registered.
 *
 *  - 400 `invalid_email`: not an email address.
 *  - 429 `reset_rate_limited`: 3 per address per hour, 30 per client IP per hour (server/auth/auth-limits.ts).
 *  - 503 `password_reset_unavailable`: this server cannot send email (docs/password-reset.md); the sign-in page does
 *    not offer "Forgot password?" then.
 */
const MAX_EMAIL_LENGTH = 254;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST = withErrorHandling(async (request: Request) => {
  if (isCrossSite(request)) return errorResponse(403, "cross_site_request", "This request was not made from CEFRO.");
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_SHAPE.test(email)) {
    return errorResponse(400, "invalid_email", "Enter the email you signed up with.");
  }
  if (!emailAvailable()) {
    return errorResponse(503, "password_reset_unavailable", "Password reset by email is not switched on yet. Ask your teacher for help.");
  }
  const limits = authLimiters();
  for (const state of [limits.resetEmailByIp.hit(clientIp(request)), limits.resetEmailByEmail.hit(`email:${email}`)]) {
    if (!state.allowed) {
      return errorResponse(429, "reset_rate_limited", "Too many reset emails. Please wait an hour and try again.", state.retryAfterSeconds);
    }
  }
  const response = await callAuthLibrary(request, "/request-password-reset", { email });
  if (!response.ok) {
    logger.error("Password reset request failed in the auth library", { status: response.status });
    return errorResponse(500, "internal_error", "Something went wrong. Please try again.");
  }
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
});
