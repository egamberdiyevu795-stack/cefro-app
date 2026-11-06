import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FEATURE_FLAGS } from "@/config/features";
import { getSpeakingTask } from "@/content/speaking";
import type { AttemptView } from "@/domain/speaking/attempt";
import { toPublicTask } from "@/domain/speaking/task";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { NoticeCard, UploadFailedCard } from "@/features/speaking-practice/components/screens";
import { ComparisonResult, type ComparedAttempt } from "./comparison";
import { attemptAudioUrl, resultSourceFromAttempt } from "./from-attempt";
import { mockRetryAttempt } from "./mock-data";
import { FailedResult, ScoredResult } from "./sections";
import { resultPageState } from "./view-model";

const speakingTask = getSpeakingTask("b2-part2-advice-from-someone")!;
const task = toPublicTask(speakingTask);
const bandLabels = getSpeakingRubric(speakingTask).config.bands.map(({ band, label }) => ({ band, label }));
const noop = () => undefined;
const BLACK = /class="[^"]*\bbg-primary text-on-primary\b/g;
const blacks = (html: string) => (html.match(BLACK) ?? []).length;
const SMALL = /text-\[(\d|10)(\.\d+)?px\]|text-xs\b/;

/** A stored attempt in the API's shape, from a saved live run. */
const stored = (anchor: string, overrides: Partial<AttemptView> = {}): AttemptView => ({ ...mockRetryAttempt({ anchor, run: 1 }, task), ...overrides });

describe("real attempts → the result page", () => {
  it("a completed attempt is scored from its own stored evaluation", () => {
    const attempt = stored("A2-b1-all-three");
    const state = resultPageState(resultSourceFromAttempt(attempt, { task, bandLabels })!);
    if (state.kind !== "scored") throw new Error(state.kind);
    expect(state.view.headline).toBe("Part 2 · Band 2 · Higher B1");
    expect(state.view.transcript).toBe(attempt.transcript!.text);
    expect(state.view.retry).toBeNull();
    expect(state.view.developmentEvaluator).toBe(false);
  });

  it("a retry with its previous attempt loaded: band change and 'Goal met'", () => {
    const previous = stored("A2-b1-all-three");
    const attempt = stored("A3-b2-q3-missing", { id: "after", attemptNumber: 2, previousAttemptId: previous.id });
    const state = resultPageState(resultSourceFromAttempt(attempt, { task, bandLabels, previous })!);
    if (state.kind !== "scored") throw new Error(state.kind);
    expect(state.view.retry).toMatchObject({ previousBand: 2, band: 3, goal: "met" });
  });

  it("the development evaluator is said on the page", () => {
    const attempt = stored("A2-b1-all-three");
    attempt.evaluation = { ...attempt.evaluation!, meta: { ...attempt.evaluation!.meta, isDevelopmentProvider: true } };
    const state = resultPageState(resultSourceFromAttempt(attempt, { task, bandLabels })!);
    if (state.kind !== "scored") throw new Error(state.kind);
    const html = renderToStaticMarkup(createElement(ScoredResult, { view: state.view, task, flags: FEATURE_FLAGS, retryHref: noop, audio: { src: attemptAudioUrl(attempt.id), durationMs: 1000 } }));
    expect(html).toContain("Development evaluator.");
    expect(html).toContain("<audio");
    expect(html).not.toContain("Play recording"); // the real player, not the flagged placeholder
    expect(blacks(html)).toBe(1);
  });

  it("in progress → scoring; failed → failed; no speech → couldn't score; stalled → failed (try again)", () => {
    const base = stored("A2-b1-all-three", { evaluation: null });
    expect(resultPageState(resultSourceFromAttempt({ ...base, status: "evaluating" }, { task, bandLabels })!).kind).toBe("scoring");
    expect(resultPageState(resultSourceFromAttempt({ ...base, status: "failed", failure: { stage: "evaluation", code: "evaluation_failed" } }, { task, bandLabels })!).kind).toBe("failed");
    expect(
      resultPageState(resultSourceFromAttempt({ ...base, status: "failed", transcript: null, failure: { stage: "transcription", code: "transcription_empty" } }, { task, bandLabels })!),
    ).toMatchObject({ kind: "not_scored", reason: "no_speech" });
    expect(resultPageState(resultSourceFromAttempt({ ...base, status: "evaluating", isStalled: true }, { task, bandLabels })!)).toMatchObject({
      kind: "failed",
      failure: { code: "processing_stalled" },
    });
  });

  it("an attempt scored with the old method (no band) is not shown on the new page", () => {
    const attempt = stored("A2-b1-all-three");
    attempt.evaluation = { ...attempt.evaluation!, result: { kind: "legacy" } as never };
    expect(resultSourceFromAttempt(attempt, { task, bandLabels })).toBeNull();
  });
});

describe("comparison and error screens (design system)", () => {
  const compared = (anchor: string, attemptNumber: number): ComparedAttempt => {
    const a = stored(anchor);
    return { attemptNumber, result: a.evaluation!.result as ComparedAttempt["result"], metrics: null, methodology: "3.5.0|2.1.0", transcript: a.transcript!.text };
  };

  it("comparison: one black button, honest verdict, no text under 11 px", () => {
    const html = renderToStaticMarkup(
      createElement(ComparisonResult, { before: compared("A2-b1-all-three", 1), after: compared("A3-b2-q3-missing", 2), taskTitle: task.title, onRetry: noop, onBack: noop }),
    );
    expect(blacks(html)).toBe(1);
    expect(html).not.toMatch(SMALL);
    expect(html).toContain("Attempt 1 vs Attempt 2");
    expect(html).toContain("Slightly better, but the difference is small.");
    expect(html).not.toContain("clearly better");
  });

  it("scoring failed: 'Try again' is black when the recording can be scored again, 'Record again' when it should be re-recorded", () => {
    const failed = (code: "evaluation_failed" | "audio_unavailable") =>
      renderToStaticMarkup(createElement(FailedResult, { state: { kind: "failed", task, failure: { stage: "evaluation", code } }, recordHref: noop, onTryAgain: noop }));
    for (const code of ["evaluation_failed", "audio_unavailable"] as const) {
      const html = failed(code);
      expect(blacks(html)).toBe(1);
      expect(html).not.toMatch(SMALL);
    }
    expect(failed("evaluation_failed")).toMatch(/bg-primary text-on-primary[^"]*"[^>]*>(<svg[\s\S]*?<\/svg>)?Try again/);
    expect(failed("audio_unavailable")).toMatch(/bg-primary text-on-primary[^"]*"[^>]*>(<svg[\s\S]*?<\/svg>)?Record again/);
  });

  it("upload failed and notices: one black button each", () => {
    const upload = renderToStaticMarkup(createElement(UploadFailedCard, { message: "No connection.", recording: { url: "blob:x", mimeType: "audio/webm" }, onRetry: noop, onReRecord: noop }));
    expect(blacks(upload)).toBe(1);
    expect(upload).toContain("Download a copy");
    const notice = renderToStaticMarkup(createElement(NoticeCard, { title: "We couldn't find this answer", action: { label: "Record a new answer", onClick: noop } }, "Gone."));
    expect(blacks(notice)).toBe(1);
  });
});
