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
import { writeReport } from "./report";

/**
 * Runs every sample in the B2 Part 2 test set through the REAL configured
 * evaluator and writes a review report (eval-reports/). Hard assertions cover
 * safety rules; level/criterion expectations are soft (reported, not fatal),
 * because examiners can reasonably disagree by a band.
 *
 *   EVALUATION_PROVIDER=anthropic ANTHROPIC_API_KEY=... npm run eval:live
 *   EVAL_SAMPLES=S01,S04 npm run eval:live   # subset
 */
const configured = process.env.EVALUATION_PROVIDER !== "mock" && Boolean(process.env.ANTHROPIC_API_KEY);
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

describe.skipIf(!configured)("LIVE: real evaluator on the B2 Part 2 sample set", () => {
  const rows: { sample: EvaluationSample; evaluation?: SpeakingEvaluation; error?: string; misses: string[] }[] = [];

  it.each(samples.map((s) => [s.id, s] as const))("%s", async (_id, sample) => {
    const row: (typeof rows)[number] = { sample, misses: [] };
    rows.push(row);
    try {
      row.evaluation = await evaluateSpeaking(inputFor(sample), getEvaluationModel());
    } catch (error) {
      row.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
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
    expect.soft(row.misses, `${sample.id} expectations`).toEqual([]);
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
    expect(second.result.retry_review).not.toBeNull();
    const comparison = compareAttempts({ evaluation: first.result, metrics: null }, { evaluation: second.result, metrics: null });
    expect.soft(comparison.verdict).toMatch(/improvement/);
    rows.push({ sample: { ...byId("S01"), id: "RETRY S03→S01" }, evaluation: second, misses: [`verdict: ${comparison.verdict}`] });
  });

  it("writes the review report", () => {
    const file = writeReport("live-evaluation", renderMarkdown(rows), rows);
    console.log(`\nReview report: ${file}\n`);
  });
});

function byId(prefix: string): EvaluationSample {
  return B2_PART2_SAMPLES.find((s) => s.id.startsWith(prefix))!;
}

function renderMarkdown(rows: { sample: EvaluationSample; evaluation?: SpeakingEvaluation; error?: string; misses: string[] }[]): string {
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
