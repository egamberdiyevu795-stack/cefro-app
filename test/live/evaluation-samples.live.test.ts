import { describe, expect, it } from "vitest";
import { getSpeakingTask } from "@/content/speaking";
import { levelValue } from "@/domain/evaluation/multilevel/levels";
import { compareAttempts } from "@/domain/speaking/comparison";
import { computeSpeechMetrics } from "@/domain/speaking/metrics";
import { getEvaluationModel } from "@/server/evaluation";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { evaluateSpeaking, type SpeakingEvaluation } from "@/server/evaluation/speaking-evaluator";
import type { EvaluationInput } from "@/server/evaluation/types";
import { B2_PART2_SAMPLES, type EvaluationSample } from "../evaluation-samples/b2-part2-samples";
import { renderMultilevelResult } from "./checks";
import { evaluatorSelection } from "./providers";
import { writeReport } from "./report";

/**
 * Runs every sample in the B2 Part 2 test set through the REAL configured
 * evaluator and writes a review report (eval-reports/). Hard assertions cover
 * safety rules; band/feature/coverage expectations are soft (reported, not
 * fatal), because examiners can reasonably disagree by a band.
 *
 *   EVALUATION_PROVIDER=gemini GEMINI_API_KEY=... npm run eval:live
 *   EVALUATION_PROVIDER=anthropic ANTHROPIC_API_KEY=... npm run eval:live
 *   EVAL_SAMPLES=S01,S04 npm run eval:live   # subset
 *
 * The provider is whatever EVALUATION_PROVIDER selects; the other provider's
 * key is not needed. Keys are read from the environment and never printed.
 * Hard assertions (quality gate passes, pronunciation not assessed from text,
 * injection ignored) fail the run; band/feature/coverage differences are
 * listed in the summary for human review.
 */
const selection = evaluatorSelection();
const configured = selection.configured;
if (!configured) console.log(`\nLIVE evaluation skipped: ${selection.hint}\n`);
const task = getSpeakingTask("b2-part2-technology-young-people")!;
const only = process.env.EVAL_SAMPLES?.split(",").map((s) => s.trim());
const samples = B2_PART2_SAMPLES.filter((s) => !only || only.some((prefix) => s.id.startsWith(prefix)));

function inputFor(sample: EvaluationSample, previous: EvaluationInput["previousAttempt"] = null): EvaluationInput {
  return {
    task,
    rubric: getSpeakingRubric(task),
    transcript: sample.transcript,
    metrics: computeSpeechMetrics(sample.transcript, sample.durationMs, task.speakingSeconds),
    audio: { storageProvider: "none", storageKey: sample.id, mimeType: "audio/webm", durationMs: sample.durationMs },
    previousAttempt: previous,
  };
}

interface Row {
  sample: EvaluationSample;
  evaluation?: SpeakingEvaluation;
  error?: string;
  failureCode?: string;
  /** Violations of each rejected draft (also kept when the evaluation failed). */
  rejectedDrafts?: { code: string; path: string; message: string }[][];
  misses: string[];
}

function failureDetails(error: unknown): Pick<Row, "error" | "failureCode" | "rejectedDrafts"> {
  const details = (error as { details?: { rejectedDrafts?: Row["rejectedDrafts"] } }).details;
  return {
    error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    failureCode: (error as { failureCode?: string }).failureCode,
    rejectedDrafts: details?.rejectedDrafts,
  };
}

describe.skipIf(!configured)("LIVE: real evaluator on the B2 Part 2 sample set", () => {
  const rows: Row[] = [];

  it.each(samples.map((s) => [s.id, s] as const))("%s", async (_id, sample) => {
    const row: Row = { sample, misses: [] };
    rows.push(row);
    try {
      row.evaluation = await evaluateSpeaking(inputFor(sample), getEvaluationModel());
    } catch (error) {
      Object.assign(row, failureDetails(error));
      throw error;
    }
    const { result } = row.evaluation;

    // Hard rules.
    expect(row.evaluation.quality.passed).toBe(true);
    expect(result.assessment.features.pronunciation.level).toBe("not_assessed");
    if (sample.id.startsWith("S13")) expect(result.scoring.band).toBeLessThanOrEqual(2);

    // Soft expectations.
    const [min, max] = sample.expect.band;
    const band = result.scoring.band;
    if (band < min || band > max) row.misses.push(`band ${band} outside ${min}–${max}`);
    const weak = sample.expect.weakFeatures;
    if (weak && !weak.some((f) => { const l = result.assessment.features[f].level; return l !== "not_assessed" && levelValue(l) <= levelValue("B1"); })) {
      row.misses.push(`none of ${weak.join("/")} judged B1 or below`);
    }
    if (sample.expect.coverageIssue && result.scoring.on_topic_count === result.assessment.questions.length) row.misses.push("expected a question not on topic");
    for (const [id, status] of Object.entries(sample.expect.coverage ?? {})) {
      const actual = result.assessment.questions.find((q) => q.id === Number(id))?.status;
      if (actual !== status) row.misses.push(`question ${id} ${actual ?? "absent"} ≠ ${status}`);
    }
    if (sample.expect.lowBand && band > 1) row.misses.push(`expected band ≤ 1, got ${band}`);
    // Misses are recorded in the report for human review; they do not fail the run.
  });

  it("retry: weak answer → stronger answer is reviewed and compared honestly", async () => {
    const retryRow: Row = { sample: { ...byId("S01"), id: "RETRY S03→S01" }, misses: [] };
    rows.push(retryRow); // recorded even if an evaluation fails, so the failure can be reviewed
    let first: SpeakingEvaluation;
    let second: SpeakingEvaluation;
    try {
      first = await evaluateSpeaking(inputFor(byId("S03")), getEvaluationModel());
      second = await evaluateSpeaking(
        inputFor(byId("S01"), {
          attemptNumber: 1,
          transcript: byId("S03").transcript,
          retryFocus: first.result.retry_focus,
        }),
        getEvaluationModel(),
      );
    } catch (error) {
      Object.assign(retryRow, failureDetails(error));
      throw error;
    }
    const comparison = compareAttempts({ evaluation: first.result, metrics: null }, { evaluation: second.result, metrics: null });
    retryRow.evaluation = second;
    retryRow.misses.push(`verdict: ${comparison.verdict}`);
    if (!second.result.assessment.retry_review) retryRow.misses.push("retry_review missing on a retry");
    if (!/improvement/.test(comparison.verdict)) retryRow.misses.push("weak → strong retry not reported as an improvement");
  });

  it("writes the review report", () => {
    const model = getEvaluationModel();
    const withRetry = rows.filter((r) => r.sample.id.startsWith("RETRY"));
    const summary = summarise(rows.filter((r) => !r.sample.id.startsWith("RETRY")), model.provider, model.model);
    summary.expectationMisses.push(...withRetry.filter((r) => r.misses.some((m) => !m.startsWith("verdict"))).map((r) => ({ id: r.sample.id, misses: r.misses })));
    const file = writeReport("live-evaluation", `${renderSummary(summary)}\n\n${renderMarkdown(rows)}`, { summary, rows });
    console.log(`\n${renderSummary(summary)}\n\nReview report: ${file}\n`);
  });
});

function byId(prefix: string): EvaluationSample {
  return B2_PART2_SAMPLES.find((s) => s.id.startsWith(prefix))!;
}

interface Summary {
  provider: string;
  model: string;
  /** Models that actually answered (differs from `model` when an alias like "-latest" is configured). */
  modelsAnswered: string[];
  samples: number;
  succeeded: number;
  failed: number;
  qualityGateFailures: number;
  regenerated: number;
  expectationMisses: { id: string; misses: string[] }[];
  averageLatencyMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  failures: { id: string; code: string }[];
}

/** Aggregate the run. Contains no secrets: provider/model names and counts only. */
function summarise(rows: Row[], provider: string, model: string): Summary {
  const ok = rows.filter((r) => r.evaluation);
  const failed = rows.filter((r) => !r.evaluation);
  const sum = (values: (number | null)[]) => (values.some((v) => v !== null) ? values.reduce<number>((a, v) => a + (v ?? 0), 0) : null);
  return {
    provider,
    model,
    modelsAnswered: [...new Set(ok.map((r) => r.evaluation!.model))],
    samples: rows.length,
    succeeded: ok.length,
    failed: failed.length,
    qualityGateFailures: failed.filter((r) => r.failureCode === "evaluation_quality_rejected").length,
    regenerated: ok.filter((r) => (r.evaluation?.modelCalls ?? 1) > 1).length,
    expectationMisses: rows.filter((r) => r.misses.length > 0).map((r) => ({ id: r.sample.id, misses: r.misses })),
    averageLatencyMs: ok.length ? Math.round(ok.reduce((a, r) => a + r.evaluation!.latencyMs, 0) / ok.length) : null,
    tokensIn: sum(ok.map((r) => r.evaluation!.inputTokens)),
    tokensOut: sum(ok.map((r) => r.evaluation!.outputTokens)),
    failures: failed.map((r) => ({ id: r.sample.id, code: r.failureCode ?? "unknown" })),
  };
}

function renderSummary(s: Summary): string {
  const name = s.provider.charAt(0).toUpperCase() + s.provider.slice(1);
  return [
    `Provider: ${name}`,
    `Model: ${s.model}${s.modelsAnswered.length ? ` (answered by: ${s.modelsAnswered.join(", ")})` : ""}`,
    `Samples: ${s.samples}`,
    `Successful evaluations: ${s.succeeded}`,
    `Failed evaluations: ${s.failed}${s.failures.length ? ` (${s.failures.map((f) => `${f.id}: ${f.code}`).join(", ")})` : ""}`,
    `Quality-gate failures: ${s.qualityGateFailures}`,
    `Recovered by regeneration: ${s.regenerated}`,
    `Samples outside expected ranges (review these): ${s.expectationMisses.length}${s.expectationMisses.length ? ` (${s.expectationMisses.map((m) => m.id).join(", ")})` : ""}`,
    `Average latency: ${s.averageLatencyMs === null ? "n/a" : `${(s.averageLatencyMs / 1000).toFixed(1)}s`}`,
    `Tokens in/out (successful runs): ${s.tokensIn ?? "n/a"}/${s.tokensOut ?? "n/a"}`,
  ].join("\n");
}

function renderMarkdown(rows: Row[]): string {
  const lines = [
    "# Live evaluation report",
    "",
    `Generated ${new Date().toISOString()}. Review each item with the checklist in docs/AI_EVALUATION_QUALITY.md.`,
    "",
    "| Sample | Band | Expected | Calls | Latency | Tokens in/out | Gate warnings | Expectation misses |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const { sample, evaluation: e, error, misses } of rows) {
    lines.push(
      e
        ? `| ${sample.id} | ${e.result.scoring.band} | ${sample.expect.band.join("–")} | ${e.modelCalls} | ${(e.latencyMs / 1000).toFixed(1)}s | ${e.inputTokens}/${e.outputTokens} | ${e.quality.violations.map((v) => v.code).join(", ") || "—"} | ${misses.join("; ") || "—"} |`
        : `| ${sample.id} | ERROR | ${sample.expect.band.join("–")} | | | | | ${error} |`,
    );
  }
  for (const { sample, evaluation: e, error, rejectedDrafts } of rows) {
    if (!e) {
      lines.push("", `## ${sample.id} — FAILED`, "", `${error ?? "unknown error"}`, "");
      (rejectedDrafts ?? []).forEach((draft, n) =>
        lines.push(`**Rejected draft ${n + 1}:**`, ...draft.map((v) => `- \`${v.code}\` @ ${v.path}: ${v.message}`), ""),
      );
      continue;
    }
    const r = e.result;
    lines.push("", `## ${sample.id} — ${sample.description}`, "", `> ${sample.transcript}`, "");
    lines.push(`Model: ${e.model} · ${e.evaluatorVersion} · rubric ${e.rubricVersion} · schema v${e.schemaVersion}`, "");
    // What the quality gate rejected in earlier drafts (needed to judge whether the gate was right).
    e.quality.rejectedDrafts.forEach((draft, n) =>
      lines.push(`**Rejected draft ${n + 1}:**`, ...draft.map((v) => `- \`${v.code}\` @ ${v.path}: ${v.message}`), ""),
    );
    if (e.quality.violations.length) lines.push("**Repaired in the accepted draft:**", ...e.quality.violations.map((v) => `- \`${v.code}\` @ ${v.path}: ${v.message}`), "");
    lines.push(...renderMultilevelResult(r));
    lines.push("", "Reviewer notes: _(question statuses right? feature levels fit the descriptors? evidence exact? corrections correct? band plausible? focus actionable? invented?)_");
  }
  return lines.join("\n");
}
