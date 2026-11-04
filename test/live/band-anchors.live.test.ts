import { describe, expect, it } from "vitest";
import { getSpeakingTask } from "@/content/speaking";
import { FEATURES } from "@/domain/evaluation/multilevel/levels";
import type { MultilevelResult } from "@/domain/evaluation/multilevel/result";
import { compareAttempts } from "@/domain/speaking/comparison";
import { computeSpeechMetrics } from "@/domain/speaking/metrics";
import { getEvaluationModel } from "@/server/evaluation";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { evaluateSpeaking, type SpeakingEvaluation } from "@/server/evaluation/speaking-evaluator";
import type { EvaluationInput } from "@/server/evaluation/types";
import { PART2_BAND_ANCHORS, PART2_INJECTION_PROBE, type BandAnchor } from "../evaluation-samples/part2-band-anchors";
import { renderMultilevelResult } from "./checks";
import { evaluatorSelection } from "./providers";
import { writeReport } from "./report";

/**
 * Part 2 band anchors on the REAL configured evaluator. Every anchor must hit
 * its expected 0–5 band (`result.scoring.band`) EXACTLY; a miss fails the run
 * and is reported with the evaluator's per-feature levels and question
 * statuses, so it is clear whether the language or the on-topic judgement
 * went wrong.
 *
 *   EVALUATION_PROVIDER=gemini GEMINI_API_KEY=... npm run eval:live
 *   EVAL_SAMPLES=A2,A3 npm run eval:live   # subset (id prefixes; "A0" = both band-0 anchors)
 *
 * The full run also has two checks that are not anchors: an instruction
 * injected into the transcript is ignored (P1, hard), and a weak → strong
 * retry (A2 → A4) is compared honestly (RETRY, soft: reported, not fatal).
 * Select them with EVAL_SAMPLES=P1 / EVAL_SAMPLES=RETRY. Keys are read from
 * the environment and never printed.
 */
const selection = evaluatorSelection();
if (!selection.configured) console.log(`\nLIVE evaluation skipped: ${selection.hint}\n`);
const task = getSpeakingTask("b2-part2-advice-from-someone")!;
const only = process.env.EVAL_SAMPLES?.split(",").map((s) => s.trim()).filter(Boolean);
const selected = (id: string) => !only?.length || only.some((prefix) => id.startsWith(prefix));
const anchors = PART2_BAND_ANCHORS.filter((a) => selected(a.id));
const runInjection = selected(PART2_INJECTION_PROBE.id);
const runRetry = selected("RETRY");
const byId = (prefix: string) => PART2_BAND_ANCHORS.find((a) => a.id.startsWith(prefix))!;

function inputFor(
  sample: { id: string; transcript: string; durationMs: number },
  previousAttempt: EvaluationInput["previousAttempt"] = null,
): EvaluationInput {
  return {
    task,
    rubric: getSpeakingRubric(task),
    transcript: sample.transcript,
    metrics: computeSpeechMetrics(sample.transcript, sample.durationMs, task.speakingSeconds),
    audio: { storageProvider: "none", storageKey: sample.id, mimeType: "audio/webm", durationMs: sample.durationMs },
    previousAttempt,
  };
}

/** One line: band, per-feature levels and question statuses. */
function judgements(r: MultilevelResult): string {
  const s = r.scoring;
  const features = FEATURES.map((f) => `${f}=${r.assessment.features[f].level}`).join(", ");
  const questions = r.assessment.questions.map((q) => `Q${q.id}=${q.status}`).join(", ");
  return `band ${s.band} · language ${s.language_level} (mean ${s.language_mean}; ${features}) · ${s.on_topic_count}/3 on topic (${questions}) · memorized ${r.assessment.memorized_or_irrelevant}${s.zero_reason ? ` · zero: ${s.zero_reason}` : ""}`;
}

const expected = (a: BandAnchor) =>
  `band ${a.expect.band} · language ${a.expect.language} · ${a.expect.questions.map((q, i) => `Q${i + 1}=${q}`).join(", ")}${a.expect.memorized ? " · memorized" : ""}`;

interface Row {
  anchor: BandAnchor;
  evaluation?: SpeakingEvaluation;
  error?: string;
}

describe.skipIf(!selection.configured || anchors.length + Number(runInjection) + Number(runRetry) === 0)("LIVE: Part 2 band anchors (exact band)", () => {
  const rows: Row[] = [];

  it.each(anchors.map((a) => [a.id, a] as const))("%s", async (_id, anchor) => {
    const row: Row = { anchor };
    rows.push(row);
    try {
      row.evaluation = await evaluateSpeaking(inputFor(anchor), getEvaluationModel());
    } catch (error) {
      row.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      throw error;
    }
    const { result } = row.evaluation;
    expect(row.evaluation.quality.passed).toBe(true);
    expect(result.assessment.features.pronunciation.level).toBe("not_assessed");
    expect(result.scoring.band, `${anchor.id}: expected ${expected(anchor)}; got ${judgements(result)}`).toBe(anchor.expect.band);
  });

  it.skipIf(!runInjection)(`${PART2_INJECTION_PROBE.id}: an instruction inside the transcript is ignored`, async () => {
    const { result } = await evaluateSpeaking(inputFor(PART2_INJECTION_PROBE), getEvaluationModel());
    expect(result.scoring.band, judgements(result)).toBeLessThanOrEqual(2);
  });

  // Soft check: reported for review, does not fail the run.
  it.skipIf(!runRetry)("RETRY A2 → A4: a weak → strong retry is reviewed and compared honestly", async () => {
    const first = await evaluateSpeaking(inputFor(byId("A2")), getEvaluationModel());
    const second = await evaluateSpeaking(
      inputFor(byId("A4"), { attemptNumber: 1, transcript: byId("A2").transcript, retryFocus: first.result.retry_focus }),
      getEvaluationModel(),
    );
    const verdict = compareAttempts({ evaluation: first.result, metrics: null }, { evaluation: second.result, metrics: null }).verdict;
    const notes = [`verdict: ${verdict}`];
    if (!second.result.assessment.retry_review) notes.push("REVIEW: retry_review missing on a retry");
    if (!/improvement/.test(verdict)) notes.push("REVIEW: weak → strong retry not reported as an improvement");
    console.log(`\nRETRY A2 → A4: ${notes.join("; ")}\n`);
  });

  it.skipIf(anchors.length === 0)("writes the band anchor report", () => {
    const model = getEvaluationModel();
    const hit = (r: Row) => r.evaluation?.result.scoring.band === r.anchor.expect.band;
    const misses = rows.filter((r) => !hit(r));
    const cell = (r: Row) => {
      const e = r.evaluation!.result;
      return `${e.scoring.band}${hit(r) ? "" : " ✗"} | ${e.scoring.language_level} (${FEATURES.filter((f) => f !== "pronunciation").map((f) => e.assessment.features[f].level).join(" / ")}) | ${e.scoring.on_topic_count}/3 (${e.assessment.questions.map((q) => q.status).join(", ")})`;
    };
    const lines = [
      "# Part 2 band anchors",
      "",
      `Provider: ${model.provider} · model ${model.model}${rows.some((r) => r.evaluation) ? ` (answered by: ${[...new Set(rows.flatMap((r) => (r.evaluation ? [r.evaluation.model] : [])))].join(", ")})` : ""}`,
      `Anchors hit exactly: ${rows.length - misses.length}/${rows.length}${misses.length ? ` — MISSES: ${misses.map((r) => r.anchor.id).join(", ")}` : " — PASS"}`,
      "",
      "| Anchor | Expected | Got | Language (grammar / vocabulary / fluency / cohesion) | Questions on topic |",
      "|---|---|---|---|---|",
      ...rows.map((r) => (r.evaluation ? `| ${r.anchor.id} | ${r.anchor.expect.band} | ${cell(r)} |` : `| ${r.anchor.id} | ${r.anchor.expect.band} | ERROR | ${r.error} | |`)),
      "",
      ...misses.flatMap((r) => [
        `## MISS ${r.anchor.id} — ${r.anchor.description}`,
        "",
        `- Expected: ${expected(r.anchor)}`,
        `- Got: ${r.evaluation ? judgements(r.evaluation.result) : `ERROR ${r.error}`}`,
        `- Why this band: ${r.anchor.why}`,
        "",
        ...(r.evaluation ? renderMultilevelResult(r.evaluation.result) : []),
        "",
      ]),
    ];
    const markdown = lines.join("\n");
    const file = writeReport(
      "band-anchors",
      markdown,
      rows.map((r) => ({ id: r.anchor.id, expect: r.anchor.expect, result: r.evaluation?.result, error: r.error })),
    );
    console.log(`\n${markdown}\n\nReport: ${file}\n`);
  });
});
