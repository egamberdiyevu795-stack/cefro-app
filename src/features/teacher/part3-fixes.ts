/**
 * Part 3's transcript with its sentences to improve AND the dotted underline for words read from the lists, as on the
 * student's and the teacher's Part 3 attempt pages (`buildPart3View`). Used by T6's Part 3 card. Pure, browser-safe.
 */
import type { Q8Result } from "@/domain/evaluation/q8/result";
import type { PublicArgumentTask } from "@/domain/speaking/argument-task";
import type { TranscriptFixesView } from "@/features/result/transcript-fixes";
import { buildPart3View } from "@/features/part3/view-model";

export function part3TranscriptFixes(result: Q8Result, task: PublicArgumentTask, transcript: string, bandLabels: readonly { band: number; label: string }[]): TranscriptFixesView | null {
  return buildPart3View(result, { task, transcript, durationMs: 0, bandLabels, previous: null, isDevelopmentProvider: false }).transcriptFixes;
}
