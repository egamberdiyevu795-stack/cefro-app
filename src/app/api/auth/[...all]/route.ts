import { getAuth } from "@/server/auth/auth";
import { authLimiters, clientIp } from "@/server/auth/auth-limits";
import { getEnv } from "@/server/config/env";
import { HttpError } from "@/server/errors";
import { errorResponse, readBodyWithLimit } from "@/server/http";

/**
 * The only authentication endpoints CEFRO exposes, served by the auth library (see server/auth/auth.ts):
 *
 *   POST /api/auth/sign-up/email   create an account (and sign in)
 *   POST /api/auth/sign-in/email   sign in
 *   POST /api/auth/sign-out        end the session
 *
 * Everything else the library can do (session listing, user updates, password changes, OAuth callbacks…) is not
 * exposed: unused surface is closed, not configured. This wrapper adds abuse limits and removes the raw session
 * token from response bodies (the session travels only in the HttpOnly cookie). It makes no authentication decision.
 */
const ALLOWED = ["/sign-up/email", "/sign-in/email", "/sign-out"] as const;
type AllowedPath = (typeof ALLOWED)[number];

const limited = (code: string, message: string, retryAfterSeconds: number) => errorResponse(429, code, message, retryAfterSeconds);
const notFound = () => errorResponse(404, "not_found", "Not found.");

function allowedPath(request: Request): AllowedPath | null {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
  return ALLOWED.find((path) => pathname === `/api/auth${path}`) ?? null;
}

export async function GET() {
  return notFound();
}

/** Credentials are tiny; anything larger is refused before it is buffered or parsed (Content-Length may be missing or false). */
const MAX_AUTH_BODY_BYTES = 8 * 1024;

/**
 * Login CSRF / forced sign-out: a browser always sends `Origin` on a cross-site POST, so a request whose origin is
 * not ours is refused, and so is one the browser marks cross-site without an Origin. Requests with neither header
 * (curl, server-to-server) are not browser-driven and are allowed. The library's own origin check only runs for
 * requests that already carry cookies, which is why this does not rely on it.
 */
function isCrossSite(request: Request): boolean {
  const ownOrigin = getEnv().APP_URL ? new URL(getEnv().APP_URL!).origin : new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin !== null) return origin !== ownOrigin;
  const site = request.headers.get("sec-fetch-site");
  return site !== null && site !== "same-origin" && site !== "none";
}

export async function POST(original: Request) {
  const path = allowedPath(original);
  if (!path) return notFound();
  if (isCrossSite(original)) return errorResponse(403, "cross_site_request", "This request was not made from CEFRO.");
  let request: Request;
  try {
    const body = await readBodyWithLimit(original, MAX_AUTH_BODY_BYTES, () => new HttpError(413, "request_too_large", "That request is too large."));
    request = new Request(original.url, { method: original.method, headers: original.headers, body: new Uint8Array(body) });
  } catch (error) {
    if (error instanceof HttpError) return errorResponse(error.status, error.code, error.publicMessage);
    throw error;
  }
  const limits = authLimiters();
  const ip = clientIp(request);

  if (path === "/sign-up/email") {
    const perIp = limits.registerByIp.hit(ip);
    if (!perIp.allowed) return limited("registration_rate_limited", "Too many accounts were created from this connection. Please try again later.", perIp.retryAfterSeconds);
    const total = limits.registerGlobal.hit("all");
    if (!total.allowed) return limited("registration_rate_limited", "Registration is temporarily unavailable. Please try again later.", total.retryAfterSeconds);
    return withoutSessionToken(await getAuth().handler(request));
  }

  if (path === "/sign-in/email") {
    const email = await emailOf(request);
    for (const [limiter, key] of [[limits.loginByEmail, email], [limits.loginByIp, ip]] as const) {
      const state = limiter.isBlocked(key);
      if (state.blocked) {
        return limited("login_rate_limited", "Too many failed sign-in attempts. Please wait a few minutes and try again.", state.retryAfterSeconds);
      }
    }
    const response = await getAuth().handler(request);
    if (response.status >= 400) {
      limits.loginByEmail.hit(email);
      limits.loginByIp.hit(ip);
    }
    return withoutSessionToken(response);
  }

  return getAuth().handler(request);
}

/** The lower-cased email from a JSON sign-in body, or a constant when it cannot be read (the library rejects such requests itself). */
async function emailOf(request: Request): Promise<string> {
  try {
    const body = (await request.clone().json()) as { email?: unknown };
    return typeof body.email === "string" ? `email:${body.email.trim().toLowerCase().slice(0, 254)}` : "email:(none)";
  } catch {
    return "email:(unreadable)";
  }
}

/**
 * A successful sign-in or sign-up answers `{ "ok": true }` and nothing else: the library's body carries the raw session
 * token and the user record, and the browser needs neither (the session lives in the HttpOnly cookie; /api/account/me
 * says who is signed in). Errors are passed through. Headers, including every Set-Cookie, are carried over.
 */
async function withoutSessionToken(response: Response): Promise<Response> {
  if (response.status !== 200 || !response.headers.get("content-type")?.includes("application/json")) return response;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}
