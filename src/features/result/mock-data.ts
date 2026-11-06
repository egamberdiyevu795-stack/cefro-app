/**
 * Mock data for the result page prototype. Every scored result here is a saved live evaluator output
 * (test/fixtures/live-3.6-flash: gemini-3.6-flash, NOT the production model), passed through the real types and the
 * same view model real attempts will use. Loading them never calls a provider.
 *
 * Switches (for screenshots and reviews):
 *   ?anchor=<id>   which fixture (default A2-b1-all-three); &run=1..3 picks a run (default run 1; for A0-below-b1
 *                  that is band 2, and run 3 is the band 0 run)
 *   ?state=        scored (default) | scoring | too-short | no-speech | retry
 */
import { scoreBand } from "@/domain/evaluation/multilevel/band-scoring";
import { FEATURES } from "@/domain/evaluation/multilevel/levels";
import type { BandScoringConfig } from "@/domain/evaluation/multilevel/rubric-config";
import type { PublicSpeakingTask } from "@/domain/speaking/task";
import { PART2_BAND_ANCHORS } from "../../../test/evaluation-samples/part2-band-anchors";
import { LIVE_36_FLASH_FIXTURES, type LiveFixtureFile } from "../../../test/fixtures/live-3.6-flash";
import { countWords, type ResultEvaluation, type ResultSource } from "./view-model";

export const RESULT_STATES = ["scored", "scoring", "too-short", "no-speech", "retry"] as const;
export type ResultMockState = (typeof RESULT_STATES)[number];

export const DEFAULT_ANCHOR = "A2-b1-all-three";
export const FIXTURE_ANCHORS = Object.keys(LIVE_36_FLASH_FIXTURES);

/** The retry pair: a B1 answer whose goal was grammar, then a B2 answer (both saved live outputs). */
const RETRY_PREVIOUS = { anchor: "A2-b1-all-three", run: 1 };
const RETRY_CURRENT = { anchor: "A3-b2-q3-missing", run: 1 };

/** A made-up answer under the rubric's minimum words, for the "too short" state. */
const TOO_SHORT_TRANSCRIPT = "My teacher gave me advice. She said speak English every day. I followed it.";

export interface MockSelection {
  anchor: string;
  run: number;
  state: ResultMockState;
  file: LiveFixtureFile;
}

/** Reads the query switches; unknown values fall back to the defaults. */
export function selectMock(query: { anchor?: string | string[]; run?: string | string[]; state?: string | string[] }): MockSelection {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const anchor = one(query.anchor) && LIVE_36_FLASH_FIXTURES[one(query.anchor)!] ? one(query.anchor)! : DEFAULT_ANCHOR;
  const file = LIVE_36_FLASH_FIXTURES[anchor];
  const requested = Number(one(query.run));
  const run = Number.isInteger(requested) && requested >= 1 && requested <= file.runs.length ? requested : 1;
  const state = (RESULT_STATES as readonly string[]).includes(one(query.state) ?? "") ? (one(query.state) as ResultMockState) : "scored";
  return { anchor, run, state, file };
}

function evaluationOf(anchor: string, run: number): ResultEvaluation {
  return LIVE_36_FLASH_FIXTURES[anchor].runs[run - 1].evaluation;
}

function anchorOf(anchor: string) {
  const found = PART2_BAND_ANCHORS.find((a) => a.id === anchor);
  if (!found) throw new Error(`No anchor ${anchor}`);
  return found;
}

/**
 * The attempt the page shows, in the pipeline's own shapes. `config` is the task's rubric config (band labels, and
 * the scorer's minimum words for the too-short state).
 */
export function mockResultSource(selection: MockSelection, task: PublicSpeakingTask, config: BandScoringConfig): ResultSource {
  const bandLabels = config.bands.map(({ band, label }) => ({ band, label }));
  const base = { task, bandLabels, failure: null, previous: null };
  const a = anchorOf(selection.anchor);

  switch (selection.state) {
    case "scoring":
      // Transcription is done by the time the attempt is being scored, so the transcript is already there.
      return { ...base, status: "evaluating", recordingDurationMs: a.durationMs, transcript: a.transcript, evaluation: null };

    case "no-speech":
      return {
        ...base,
        status: "failed",
        failure: { stage: "transcription", code: "transcription_empty" },
        recordingDurationMs: 12_000,
        transcript: null,
        evaluation: null,
      };

    case "too-short": {
      // The real scorer, fed a too-short answer: band 0, zero_reason "too_short". The judgements are a saved run's and
      // are not shown (a too-short answer gets no rating), only the scoring decides the page.
      const saved = evaluationOf(RETRY_PREVIOUS.anchor, RETRY_PREVIOUS.run);
      const { assessment } = saved.result;
      const scoring = scoreBand(
        {
          questions: assessment.questions,
          features: Object.fromEntries(FEATURES.map((f) => [f, assessment.features[f].level])) as Parameters<typeof scoreBand>[0]["features"],
          memorizedOrIrrelevant: assessment.memorized_or_irrelevant,
          wordCount: countWords(TOO_SHORT_TRANSCRIPT),
        },
        config,
      );
      return {
        ...base,
        status: "completed",
        recordingDurationMs: 9_000,
        transcript: TOO_SHORT_TRANSCRIPT,
        evaluation: { ...saved, result: { ...saved.result, scoring } },
      };
    }

    case "retry":
      return {
        ...base,
        status: "completed",
        recordingDurationMs: anchorOf(RETRY_CURRENT.anchor).durationMs,
        transcript: anchorOf(RETRY_CURRENT.anchor).transcript,
        evaluation: evaluationOf(RETRY_CURRENT.anchor, RETRY_CURRENT.run),
        previous: { evaluation: evaluationOf(RETRY_PREVIOUS.anchor, RETRY_PREVIOUS.run) },
      };

    default:
      return {
        ...base,
        status: "completed",
        recordingDurationMs: a.durationMs,
        transcript: a.transcript,
        evaluation: evaluationOf(selection.anchor, selection.run),
      };
  }
}

/** What the prototype strip says about the data on screen. */
export function describeMock(selection: MockSelection): string {
  const saved = "saved output of gemini-3.6-flash, not the production model";
  switch (selection.state) {
    case "retry":
      return `${RETRY_PREVIOUS.anchor} run ${RETRY_PREVIOUS.run} → ${RETRY_CURRENT.anchor} run ${RETRY_CURRENT.run} · ${saved}`;
    case "scoring":
      return `attempt still being scored (${selection.anchor} transcript), no evaluation yet`;
    case "no-speech":
      return "attempt that failed with no speech found, no evaluation";
    case "too-short":
      return "made-up 14-word answer, band from the real scorer (too short to rate)";
    default:
      return `${selection.anchor} · run ${selection.run} of ${selection.file.runs.length} · ${saved}`;
  }
}
