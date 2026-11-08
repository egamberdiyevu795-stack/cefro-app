import { createHash, timingSafeEqual } from "node:crypto";
import { deleteExpiredAudio } from "@/server/audio-retention/delete-expired-audio";
import { getEnv } from "@/server/config/env";
import { errorResponse, withErrorHandling } from "@/server/http";

// Each run handles every recording that is due; a run that stops early leaves the rest for the next day.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * The daily audio-retention job (vercel.json "crons": every day at 03:17 UTC). Vercel Cron calls it on the production
 * deployment only, with "Authorization: Bearer <CRON_SECRET>". Anything else, and every call while CRON_SECRET is unset
 * or shorter than 16 characters, is a 401 that runs nothing. → 200 `{ deleted, audioFiles, audioBlobs, skipped }`.
 * Safe to call twice (server/audio-retention/delete-expired-audio.ts).
 */
export const GET = withErrorHandling(async (request: Request) => {
  if (!authorised(request.headers.get("authorization"), getEnv().CRON_SECRET)) {
    return errorResponse(401, "unauthorised", "Not allowed.");
  }
  const summary = await deleteExpiredAudio();
  return Response.json(summary, { headers: { "Cache-Control": "no-store" } });
});

function authorised(header: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !header) return false;
  // Compare digests, so the comparison takes the same time whatever the lengths.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}
