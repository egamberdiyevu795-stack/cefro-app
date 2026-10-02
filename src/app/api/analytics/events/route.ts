import { z } from "zod";
import { CLIENT_EVENT_NAMES } from "@/domain/analytics/events";
import { trackEvents } from "@/server/analytics/track";
import { HttpError } from "@/server/errors";
import { withErrorHandling } from "@/server/http";
import { getOrCreateCurrentUserId } from "@/server/identity/anonymous-user";

const propertyValue = z.union([z.string().max(500), z.number(), z.boolean(), z.null()]);

const bodySchema = z.object({
  events: z
    .array(
      z.object({
        name: z.enum(CLIENT_EVENT_NAMES),
        taskId: z.string().max(200).nullish(),
        attemptId: z.string().uuid().nullish(),
        properties: z.record(z.string().max(64), propertyValue).optional(),
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

  trackEvents(
    parsed.data.events.map((event) => ({
      name: event.name,
      source: "client" as const,
      userId,
      taskId: event.taskId ?? null,
      attemptId: event.attemptId ?? null,
      properties: event.properties,
      occurredAt: event.occurredAt,
    })),
  );
  return new Response(null, { status: 204 });
});
