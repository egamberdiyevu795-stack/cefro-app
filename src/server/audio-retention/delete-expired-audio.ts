import "server-only";
import { and, eq, isNull, lte, ne, or } from "drizzle-orm";
import { AUDIO_RETENTION_DAYS, retentionCutoff } from "@/domain/audio-retention";
import { getEnv } from "@/server/config/env";
import { getDb, type Db } from "@/server/db/client";
import { recordingBlobs, recordings, speakingAttempts } from "@/server/db/schema";
import { logger } from "@/server/logging/logger";
import { getAudioStorage, type AudioStorage } from "@/server/storage";
import { LocalAudioStorage } from "@/server/storage/local-audio-storage";

export interface RetentionSummary {
  /** Recordings whose audio was deleted in this run (now marked `audio_deleted_at`). */
  deleted: number;
  /** Of those: files removed from disk (`local` storage). A file that was already gone counts too. */
  audioFiles: number;
  /** Of those: rows removed from `recording_blobs` (`database` storage). */
  audioBlobs: number;
  /** Recordings left for the next run: an unknown storage provider, or an error while deleting. */
  skipped: number;
}

/** How many recordings one batch handles; the job loops until nothing is due (or `maxBatches`). */
const BATCH_SIZE = 200;

/**
 * The daily audio-retention job (docs/consent-design.md, decision of 2026-11-08): deletes the stored audio of every
 * recording whose attempt was scored 30 days ago or more (or failed, or got stuck before scoring, and has not changed for
 * 30 days or more), wherever it is stored: files
 * under AUDIO_STORAGE_DIR (`local`) and rows of `recording_blobs` (`database`). The `recordings` row stays, marked with
 * `audio_deleted_at`, so the result page can say the recording was deleted; the attempt, transcript, result and
 * feedback are not touched.
 *
 * Safe to run twice, or at the same time as another run: a recording is picked only while `audio_deleted_at` is null,
 * deleting audio that is already gone is not an error, and the mark is set only once (`WHERE audio_deleted_at IS
 * NULL`). A run that stops halfway leaves the rest for the next one. An attempt being processed right now is never
 * picked (processing gives up after minutes, so 30 days without a change means it is stuck, not running).
 */
export async function deleteExpiredAudio(options: { now?: Date; db?: Db; files?: AudioStorage; maxBatches?: number } = {}): Promise<RetentionSummary> {
  const now = options.now ?? new Date();
  const db = options.db ?? (await getDb());
  const files = options.files ?? localAudioStorage();
  const cutoff = retentionCutoff(now);
  const summary: RetentionSummary = { deleted: 0, audioFiles: 0, audioBlobs: 0, skipped: 0 };
  const skippedIds = new Set<string>();

  for (let batch = 0; batch < (options.maxBatches ?? 50); batch++) {
    const due = await db
      .select({ id: recordings.id, provider: recordings.storageProvider, key: recordings.storageKey })
      .from(recordings)
      .innerJoin(speakingAttempts, eq(speakingAttempts.id, recordings.attemptId))
      .where(
        and(
          isNull(recordings.audioDeletedAt),
          or(
            and(eq(speakingAttempts.status, "completed"), lte(speakingAttempts.completedAt, cutoff)),
            // Failed, or stuck before scoring (uploaded / processing and never finished): 30 days after the last change.
            and(ne(speakingAttempts.status, "completed"), lte(speakingAttempts.updatedAt, cutoff)),
          ),
        ),
      )
      .limit(BATCH_SIZE + skippedIds.size)
      .all();
    const todo = due.filter((r) => !skippedIds.has(r.id));
    if (todo.length === 0) break;

    for (const recording of todo) {
      try {
        const marked = new Date().toISOString();
        if (recording.provider === "local") {
          await files.delete!(recording.key);
          const done = await db
            .update(recordings)
            .set({ audioDeletedAt: marked })
            .where(and(eq(recordings.id, recording.id), isNull(recordings.audioDeletedAt)))
            .run();
          if (done.rowsAffected === 1) {
            summary.deleted++;
            summary.audioFiles++;
          }
        } else if (recording.provider === "database") {
          // The bytes and the mark in one transaction: either both happen or neither.
          await db.transaction(async (tx) => {
            const done = await tx
              .update(recordings)
              .set({ audioDeletedAt: marked })
              .where(and(eq(recordings.id, recording.id), isNull(recordings.audioDeletedAt)))
              .run();
            if (done.rowsAffected !== 1) return; // another run got here first
            await tx.delete(recordingBlobs).where(eq(recordingBlobs.storageKey, recording.key)).run();
            summary.deleted++;
            summary.audioBlobs++;
          });
        } else {
          skippedIds.add(recording.id);
          summary.skipped++;
          logger.warn("Audio retention: unknown storage provider; recording kept", { provider: recording.provider });
        }
      } catch (error) {
        skippedIds.add(recording.id);
        summary.skipped++;
        logger.error("Audio retention: could not delete one recording; it is retried on the next run", { error });
      }
    }
  }

  // Counts only: no id, email or storage key in the log.
  logger.info("Audio retention run", { retentionDays: AUDIO_RETENTION_DAYS, ...summary });
  return summary;
}

/** The storage that holds `local` recordings: the app's own when it is the local one, else the configured folder. */
function localAudioStorage(): AudioStorage {
  const current = getAudioStorage();
  return current.provider === "local" && current.delete ? current : new LocalAudioStorage(getEnv().AUDIO_STORAGE_DIR);
}
