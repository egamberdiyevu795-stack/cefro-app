/**
 * Product analytics event names.
 *
 * Client events are sent by the browser through `POST /api/analytics/events`
 * (only names in CLIENT_EVENT_NAMES are accepted there). Server events are
 * recorded by the processing pipeline, where the outcome is known reliably.
 */
export const CLIENT_EVENT_NAMES = [
  "practice_opened",
  "preparation_started",
  "preparation_completed",
  "recording_started",
  "recording_completed",
  "recording_discarded",
  "microphone_permission_denied",
  "upload_failed",
  "feedback_viewed",
  "retry_started",
  "comparison_viewed",
] as const;

export const SERVER_EVENT_NAMES = [
  "recording_submitted",
  "transcription_started",
  "speech_guard_blocked",
  "transcription_completed",
  "transcription_failed",
  "evaluation_started",
  "evaluation_completed",
  "evaluation_failed",
  "retry_completed",
] as const;

export type ClientEventName = (typeof CLIENT_EVENT_NAMES)[number];
export type ServerEventName = (typeof SERVER_EVENT_NAMES)[number];
export type AnalyticsEventName = ClientEventName | ServerEventName;

/** Flat, JSON-serialisable properties. Keep values small; never include transcripts or audio. */
export type EventProperties = Record<string, string | number | boolean | null>;
