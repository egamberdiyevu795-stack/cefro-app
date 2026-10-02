import { describe, expect, it } from "vitest";
import { getSpeakingTask } from "@/content/speaking";
import { cefrRank } from "@/domain/cefr";
import { CRITERION_LABELS } from "@/domain/evaluation/criteria";
import { compareAttempts } from "@/domain/speaking/comparison";
import { computeSpeechMetrics } from "@/domain/speaking/metrics";
import { getEvaluationModel } from "@/server/evaluation";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { evaluateSpeaking, type SpeakingEvaluation } from "@/server/evaluation/speaking-evaluator";
import type { EvaluationInput } from "@/server/evaluation/types";
import { B2_PART2_SAMPLES, type EvaluationSample } from "../evaluation-samples/b2-part2-samples";
import { evaluatorSelection } from "./providers";
import { writeReport } from "./report";

/**
 * Runs every sample in the B2 Part 2 test set through the REAL configured
 * evaluator and writes a review report (eval-reports/). Hard assertions cover
 * safety rules; level/criterion expectations are soft (reported, not fatal),
 * because examiners can reasonably disagree by a band.
 *
 *   EVALUATION_PROVIDER=gemini GEMINI_API_KEY=... npm run eval:live
 *   EVALUATION_PROVIDER=anthropic ANTHROPIC_API_KEY=... npm run eval:live
 *   EVAL_SAMPLES=S01,S04 npm run eval:live   # subset
 *
 * The provider is whatever EVALUATION_PROVIDER selects; the other provider's
 * key is not needed. Keys are read from the environment and never printed.
 * Hard assertions (quality gate passes, pronunciation not assessed, injection
 * ignored) fail the run; level/criterion/coverage differences are listed in
 * the summary for human review.
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
    rubric: getSpeakingRubric("B2"),
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
  misses: string[];
}

describe.skipIf(!configured)("LIVE: real evaluator on the B2 Part 2 sample set", () => {
  const rows: Row[] = [];

  it.each(samples.map((s) => [s.id, s] as const))("%s", async (_id, sample) => {
    const row: Row = { sample, misses: [] };
    rows.push(row);
    try {
      row.evaluation = await evaluateSpeaking(inputFor(sample), getEvaluationModel());
    } catch (error) {
      row.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      row.failureCode = (error as { failureCode?: string }).failureCode;
      throw error;
    }
    const { result } = row.evaluation;

    // Hard rules.
    expect(row.evaluation.quality.passed).toBe(true);
    expect(result.criteria.pronunciation.assessable).toBe(false);
    if (sample.id.startsWith("S13")) expect(cefrRank(result.overall_level)).toBeLessThanOrEqual(cefrRank("B1+"));

    // Soft expectations.
    const [min, max] = sample.expect.level;
    const rank = cefrRank(result.overall_level);
    if (rank < cefrRank(min) || rank > cefrRank(max)) row.misses.push(`level ${result.overall_level} outside ${min}–${max}`);
    if (sample.expect.issueCriteria && !result.issues.some((i) => sample.expect.issueCriteria!.includes(i.criterion))) {
      row.misses.push(`no issue in ${sample.expect.issueCriteria.join("/")}`);
    }
    for (const [index, status] of Object.entries(sample.expect.coverage ?? {})) {
      const actual = result.task_coverage.find((c) => c.prompt_index === Number(index))?.status;
      if (actual !== status) row.misses.push(`coverage[${index}] ${actual ?? "missing"} ≠ ${status}`);
    }
    if (sample.expect.reliabilityNote && !result.reliability_note) row.misses.push("expected a reliability note");
    // Misses are recorded in the report for human review; they do not fail the run.
  });

  it("retry: weak answer → stronger answer is reviewed and compared honestly", async () => {
    const first = await evaluateSpeaking(inputFor(byId("S03")), getEvaluationModel());
    const second = await evaluateSpeaking(
      inputFor(byId("S01"), {
        attemptNumber: 1,
        transcript: byId("S03").transcript,
        evaluation: first.result,
        retryFocus: first.result.retry_focus,
      }),
      getEvaluationModel(),
    );
    const comparison = compareAttempts({ evaluation: first.result, metrics: null }, { evaluation: second.result, metrics: null });
    const misses = [`verdict: ${comparison.verdict}`];
    if (!second.result.retry_review) misses.push("retry_review missing on a retry");
    if (!/improvement/.test(comparison.verdict)) misses.push("weak → strong retry not reported as an improvement");
    rows.push({ sample: { ...byId("S01"), id: "RETRY S03→S01" }, evaluation: second, misses });
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
    "| Sample | Level | Expected | Calls | Latency | Tokens in/out | Gate warnings | Expectation misses |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const { sample, evaluation: e, error, misses } of rows) {
    lines.push(
      e
        ? `| ${sample.id} | ${e.result.overall_level} | ${sample.expect.level.join("–")} | ${e.modelCalls} | ${(e.latencyMs / 1000).toFixed(1)}s | ${e.inputTokens}/${e.outputTokens} | ${e.quality.violations.map((v) => v.code).join(", ") || "—"} | ${misses.join("; ") || "—"} |`
        : `| ${sample.id} | ERROR | ${sample.expect.level.join("–")} | | | | | ${error} |`,
    );
  }
  for (const { sample, evaluation: e } of rows) {
    if (!e) continue;
    const r = e.result;
    lines.push("", `## ${sample.id} — ${sample.description}`, "", `> ${sample.transcript}`, "", `**${r.overall_level}** — ${r.overall_summary}`, "");
    lines.push(`Model: ${e.model} · ${e.evaluatorVersion} · rubric ${e.rubricVersion} · schema v${e.schemaVersion}`, "");
    // What the quality gate rejected in earlier drafts (needed to judge whether the gate was right).
    e.quality.rejectedDrafts.forEach((draft, n) =>
      lines.push(`**Rejected draft ${n + 1}:**`, ...draft.map((v) => `- \`${v.code}\` @ ${v.path}: ${v.message}`), ""),
    );
    if (e.quality.violations.length) lines.push("**Repaired in the accepted draft:**", ...e.quality.violations.map((v) => `- \`${v.code}\` @ ${v.path}: ${v.message}`), "");
    lines.push("**Scores:** " + Object.entries(r.criteria).map(([k, c]) => `${CRITERION_LABELS[k as keyof typeof CRITERION_LABELS]} ${c.score ?? "n/a"}`).join(" · "));
    lines.push("", "**Task coverage:** " + r.task_coverage.map((c) => `#${c.prompt_index} ${c.status} (${c.note})`).join("; "));
    lines.push("", "**Strengths**", ...r.strengths.map((s) => `- ${s.title}: ${s.detail} — “${s.evidence_quote}”`));
    lines.push("", "**Issues**");
    r.issues.forEach((i, n) =>
      lines.push(
        `${n + 1}. [${i.severity} · ${i.criterion} · ${i.evidence_basis}] ${i.problem}`,
        `   - Evidence: ${i.evidence_quotes.map((q) => `“${q}”`).join(", ") || "—"}`,
        `   - Why: ${i.why_it_matters}`,
        `   - Fix: ${i.how_to_fix}`,
        `   - Better: “${i.improved_example.original}” → “${i.improved_example.improved}”`,
      ),
    );
    lines.push("", "**Retry focus**", ...r.retry_focus.map((f) => `- ${f.objective} (check: ${f.success_check}) → issue ${f.addresses_issue + 1}`));
    if (r.retry_review) lines.push("", "**Retry review**", ...r.retry_review.objectives.map((o) => `- ${o.outcome}: ${o.objective} — ${o.evidence}`), r.retry_review.summary);
    if (r.reliability_note) lines.push("", `**Reliability note:** ${r.reliability_note}`);
    lines.push("", "Reviewer notes: _(understood? issues real? evidence accurate? correction correct? meaning kept? focus actionable? too long? invented?)_");
  }
  return lines.join("\n");
}
