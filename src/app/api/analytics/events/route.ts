import { z } from "zod";
import { CLIENT_EVENT_NAMES } from "@/domain/analytics/events";
import { trackEvents } from "@/server/analytics/track";
import { HttpError } from "@/server/errors";
import { withErrorHandling } from "@/server/http";
import { getOrCreateCurrentUserId } from "@/server/identity/anonymous-user";
import { FixedWindowLimiter } from "@/server/limits/fixed-window";
import { ownedSessionIds } from "@/server/sessions/session-service";

/** Generous for real use (a few events per page), small enough to stop table flooding. */
const limiter = new FixedWindowLimiter(300, 60 * 1000);

const propertyValue = z.union([z.string().max(500), z.number(), z.boolean(), z.null()]);

const bodySchema = z.object({
  events: z
    .array(
      z.object({
        name: z.enum(CLIENT_EVENT_NAMES),
        sessionId: z.string().max(64).nullish(),
        taskId: z.string().max(200).nullish(),
        attemptId: z.string().uuid().nullish(),
        properties: z
          .record(z.string().max(64), propertyValue)
          .refine((props) => Object.keys(props).length <= 20, "Too many properties")
          .optional(),
        occurredAt: z.iso.datetime(),
      }),
    )
    .min(1)
    .max(25),
});

/** Ingest client-side analytics events. The user id comes from the cookie, never the body. */
export const POST = withErrorHandling(async (request: Request) => {
  const userId = await getOrCreateCurrentUserId();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "invalid_events", "Invalid analytics payload.");

  const verdict = limiter.hit(userId, parsed.data.events.length);
  if (!verdict.allowed) {
    throw new HttpError(429, "rate_limited", "Too many events.", verdict.retryAfterSeconds);
  }

  // A session id is kept only if the server issued it to THIS user; anything else is stored as no session.
  const sessions = ownedSessionIds(
    userId,
    parsed.data.events.flatMap((event) => (event.sessionId ? [event.sessionId] : [])),
  );

  trackEvents(
    parsed.data.events.map((event) => ({
      name: event.name,
      source: "client" as const,
      userId,
      sessionId: event.sessionId && sessions.has(event.sessionId) ? event.sessionId : null,
      taskId: event.taskId ?? null,
      attemptId: event.attemptId ?? null,
      properties: event.properties,
      occurredAt: event.occurredAt,
    })),
  );
  return new Response(null, { status: 204 });
});
