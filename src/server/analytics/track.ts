import "server-only";
import type { AnalyticsEventName, EventProperties } from "@/domain/analytics/events";
import { getDb } from "@/server/db/client";
import { analyticsEvents } from "@/server/db/schema";
import { newId, nowIso } from "@/server/ids";
import { logger } from "@/server/logging/logger";

export interface TrackEventInput {
  name: AnalyticsEventName;
  source: "client" | "server";
  userId?: string | null;
  /** Must already be verified as belonging to `userId` (see sessions/session-service.ts). */
  sessionId?: string | null;
  taskId?: string | null;
  attemptId?: string | null;
  properties?: EventProperties;
  occurredAt?: string;
}

/**
 * Record analytics events. Analytics must never break the product, so
 * failures are logged and swallowed.
 *
 * Events go to the `analytics_events` table for now; forwarding to a
 * hosted analytics tool later only requires changing this function.
 */
export function trackEvents(events: TrackEventInput[]): void {
  if (events.length === 0) return;
  try {
    getDb()
      .insert(analyticsEvents)
      .values(
        events.map((event) => ({
          id: newId(),
          name: event.name,
          source: event.source,
          userId: event.userId ?? null,
          sessionId: event.sessionId ?? null,
          taskId: event.taskId ?? null,
          attemptId: event.attemptId ?? null,
          properties: event.properties ?? null,
          occurredAt: event.occurredAt ?? nowIso(),
        })),
      )
      .run();
  } catch (error) {
    logger.error("Failed to record analytics events", { error, names: events.map((e) => e.name) });
  }
}

export function trackServerEvent(event: Omit<TrackEventInput, "source">): void {
  trackEvents([{ ...event, source: "server" }]);
}
