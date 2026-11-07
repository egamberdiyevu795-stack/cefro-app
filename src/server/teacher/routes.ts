import "server-only";
import { JOIN_CODE_FAILURES_PER_HOUR } from "@/domain/teacher/rules";
import { HttpError } from "@/server/errors";
import { errorResponse, isCrossSite, withErrorHandling } from "@/server/http";
import { requireAuthenticated } from "@/server/identity/current-user";
import { FixedWindowLimiter } from "@/server/limits/fixed-window";
import { teacherLive } from "./release";
import { requireTeacher } from "./teacher-store";

/** Every Teacher view response: never cached (each request runs the access check). */
export const NO_STORE = { "Cache-Control": "no-store" } as const;

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });

type Handler<Ctx> = (request: Request, ctx: Ctx, userId: string) => Promise<Response>;

/**
 * A Teacher view API route. While the release switch is off (no parent consent yet), 404 for everyone. Writes from
 * another site are refused. `teacher`: the caller must be a signed-in teacher, else the same 404 as a stranger's
 * result (an anonymous caller included). `student`: any signed-in account (401 otherwise).
 */
export function teacherRoute<Ctx>(who: "teacher" | "student", handler: Handler<Ctx>) {
  return withErrorHandling(async (request: Request, ctx: Ctx) => {
    if (!teacherLive()) return errorResponse(404, "not_found", "Not found.");
    if (request.method !== "GET" && isCrossSite(request)) return errorResponse(403, "cross_site_request", "This request was not made from CEFRO.");
    let userId: string;
    try {
      userId = (await requireAuthenticated()).userId;
    } catch (error) {
      if (who === "teacher" && error instanceof HttpError && error.status === 401) return errorResponse(404, "not_found", "Not found.");
      throw error;
    }
    if (who === "teacher") await requireTeacher(userId);
    return handler(request, ctx, userId);
  });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body = (await request.json().catch(() => null)) as unknown;
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "invalid_body", "That request could not be read.");
  return body as Record<string, unknown>;
}

/* Wrong join codes: 10 per account per hour (plan section 4), so codes can't be guessed. In memory, per process. */
let joinFailures: FixedWindowLimiter | undefined;
const limiter = () => (joinFailures ??= new FixedWindowLimiter(JOIN_CODE_FAILURES_PER_HOUR, 60 * 60 * 1000));

export function assertJoinAllowed(userId: string): void {
  const state = limiter().isBlocked(userId);
  if (state.blocked) throw new HttpError(429, "join_rate_limited", "Too many wrong codes. Please wait a while and try again.", state.retryAfterSeconds);
}

export function countWrongCode(userId: string): void {
  limiter().hit(userId);
}

/** Test seam. */
export function resetJoinLimiterForTesting(): void {
  joinFailures = undefined;
}
