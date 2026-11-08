import { describe, expect, it } from "vitest";
import { getSpeakingTask } from "@/content/speaking";
import { computeSpeechMetrics } from "@/domain/speaking/metrics";
import type { SpeakingTask } from "@/domain/speaking/task";
import { priceFor } from "@/server/evaluation/pricing";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import type { EvaluationInput } from "@/server/evaluation/types";
import { PART2_BAND_ANCHORS } from "./evaluation-samples/part2-band-anchors";
import { PART2_NEW_TASK_ANCHORS } from "./evaluation-samples/part2-new-task-anchors";
import { LIVE_36_FLASH_FIXTURES } from "./fixtures/live-3.6-flash";
import { calibrate, dryRunReport, dryRunTotals, promptChars, type PlannedEvaluation } from "./live/dry-run";

/** The live run's `--dry-run`: the plan, the prompts and the cost estimate, without any model call. */
const input = (task: SpeakingTask, a: { id: string; transcript: string; durationMs: number }): EvaluationInput => ({
  task,
  rubric: getSpeakingRubric(task),
  transcript: a.transcript,
  metrics: computeSpeechMetrics(a.transcript, a.durationMs, task.speakingSeconds),
  audio: { storageProvider: "none", storageKey: a.id, mimeType: "audio/webm", durationMs: a.durationMs },
  previousAttempt: null,
});
const advice = getSpeakingTask("b2-part2-advice-from-someone")!;
const calibration = calibrate(Object.values(LIVE_36_FLASH_FIXTURES), (id) => {
  const anchor = PART2_BAND_ANCHORS.find((a) => a.id === id);
  return anchor ? input(advice, anchor) : null;
});
const plan: PlannedEvaluation[] = PART2_NEW_TASK_ANCHORS.map((a) => ({ id: a.id, group: "new-task anchor", input: input(getSpeakingTask(a.taskId)!, a), runs: 3 }));

describe("live evaluation dry run", () => {
  it("the 12 new-task anchors, each with its own task (6 tasks, 2 answers each)", () => {
    expect(plan).toHaveLength(12);
    expect(new Set(plan.map((p) => p.input.task.id)).size).toBe(6);
    for (const p of plan) expect(p.input.task.id).toBe(PART2_NEW_TASK_ANCHORS.find((a) => a.id === p.id)!.taskId);
  });

  it("calibrates from the saved runs: a plausible token ratio and output size", () => {
    expect(calibration.tokensPerChar).toBeGreaterThan(0.15);
    expect(calibration.tokensPerChar).toBeLessThan(0.6);
    expect(calibration.outputTokens).toBeGreaterThan(1_000);
    expect(calibration.basis).toMatch(/gemini-3\.6-flash/);
  });

  it("totals: 36 evaluations, a cost at the configured price, double in the worst case; n/a without a price", () => {
    const price = priceFor("gemini-3.8-flash", {});
    const totals = dryRunTotals(plan, calibration, price);
    expect(totals.evaluations).toBe(36);
    expect(totals.costUsd).toBeGreaterThan(0.3);
    expect(totals.costUsd).toBeLessThan(3);
    expect(totals.worstCaseUsd).toBeCloseTo(totals.costUsd! * 2, 10);
    expect(dryRunTotals(plan, calibration, null).costUsd).toBeNull();
  });

  it("the report shows every planned evaluation and every prompt in full", () => {
    const { summary, full } = dryRunReport(plan, { provider: "gemini", model: "gemini-3.8-flash", repeat: 3, price: priceFor("gemini-3.8-flash", {}), calibration });
    expect(summary).toMatch(/DRY RUN \(nothing sent, no model called\)/);
    for (const p of plan) {
      expect(summary).toContain(`| ${p.id} |`);
      expect(full).toContain(p.input.transcript.slice(0, 80));
    }
    expect(full.length).toBeGreaterThan(plan.map((p) => promptChars(p.input)).reduce((a, b) => a + b, 0) / 3);
  });
});
