import { describe, expect, it } from "vitest";
import { getSpeakingTask } from "@/content/speaking";
import { cefrRank } from "@/domain/cefr";
import { compareAttempts } from "@/domain/speaking/comparison";
import { computeSpeechMetrics } from "@/domain/speaking/metrics";
import { getEvaluationModel } from "@/server/evaluation";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { evaluateSpeaking } from "@/server/evaluation/speaking-evaluator";
import type { EvaluationInput } from "@/server/evaluation/types";
import { deriveBand, describeDerivation, type BandDerivation } from "../evaluation-samples/part2-band";
import { PART2_BAND_ANCHORS, PART2_INJECTION_PROBE, type BandAnchor } from "../evaluation-samples/part2-band-anchors";
import { evaluatorSelection } from "./providers";
import { writeReport } from "./report";

/**
 * Part 2 band anchors on the REAL configured evaluator. Every anchor must hit
 * its expected 0–5 band EXACTLY; a miss fails the run and is reported with the
 * evaluator's per-feature levels and question statuses, so it is clear whether
 * the language judgement or the on-topic judgement went wrong.
 *
 *   EVALUATION_PROVIDER=gemini GEMINI_API_KEY=... npm run eval:live
 *   EVAL_SAMPLES=A2,A3 npm run eval:live   # subset (id prefixes; "A0" = both band-0 anchors)
 *
 * The full run also has two hard checks that are not anchors: an injected
 * instruction in the transcript is ignored (P1), and a weak → strong retry
 * (A2 → A4) is reported as an improvement (RETRY). Select them with
 * EVAL_SAMPLES=P1 / EVAL_SAMPLES=RETRY.
 */
const selection = evaluatorSelection();
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

interface Row {
  anchor: BandAnchor;
  derivation?: BandDerivation;
  error?: string;
}

describe.skipIf(!selection.configured || anchors.length + Number(runInjection) + Number(runRetry) === 0)("LIVE: Part 2 band anchors (exact band)", () => {
  const rows: Row[] = [];

  it.each(anchors.map((a) => [a.id, a] as const))("%s", async (_id, anchor) => {
    const row: Row = { anchor };
    rows.push(row);
    try {
      const evaluation = await evaluateSpeaking(inputFor(anchor), getEvaluationModel());
      expect(evaluation.result.criteria.pronunciation.assessable).toBe(false);
      row.derivation = deriveBand(evaluation.result);
    } catch (error) {
      row.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      throw error;
    }
    expect(row.derivation.band, `${anchor.id}: expected band ${anchor.expect.band}, got ${describeDerivation(row.derivation)}`).toBe(anchor.expect.band);
  });

  it.skipIf(!runInjection)(`${PART2_INJECTION_PROBE.id}: an instruction inside the transcript is ignored`, async () => {
    const { result } = await evaluateSpeaking(inputFor(PART2_INJECTION_PROBE), getEvaluationModel());
    expect(cefrRank(result.overall_level), `overall ${result.overall_level}`).toBeLessThanOrEqual(cefrRank("B1+"));
  });

  // Soft check (as before): reported for review, does not fail the run.
  it.skipIf(!runRetry)("RETRY A2 → A4: a weak → strong retry is reviewed and compared honestly", async () => {
    const first = await evaluateSpeaking(inputFor(byId("A2")), getEvaluationModel());
    const second = await evaluateSpeaking(
      inputFor(byId("A4"), { attemptNumber: 1, transcript: byId("A2").transcript, evaluation: first.result, retryFocus: first.result.retry_focus }),
      getEvaluationModel(),
    );
    const verdict = compareAttempts({ evaluation: first.result, metrics: null }, { evaluation: second.result, metrics: null }).verdict;
    const notes = [`verdict: ${verdict}`];
    if (!second.result.retry_review) notes.push("REVIEW: retry_review missing on a retry");
    if (!/improvement/.test(verdict)) notes.push("REVIEW: weak → strong retry not reported as an improvement");
    console.log(`\nRETRY A2 → A4: ${notes.join("; ")}\n`);
  });

  it.skipIf(anchors.length === 0)("writes the band anchor report", () => {
    const hits = rows.filter((r) => r.derivation?.band === r.anchor.expect.band);
    const misses = rows.filter((r) => !hits.includes(r));
    const expected = (a: BandAnchor) =>
      `band ${a.expect.band} · language ${a.expect.language} · ${a.expect.questions.map((q, i) => `Q${i + 1}=${q}`).join(", ")}`;
    const lines = [
      "# Part 2 band anchors",
      "",
      `Provider: ${getEvaluationModel().provider} · model ${getEvaluationModel().model}`,
      `Anchors hit exactly: ${hits.length}/${rows.length}${misses.length ? ` — MISSES: ${misses.map((r) => r.anchor.id).join(", ")}` : " — PASS"}`,
      "",
      "| Anchor | Expected | Got | Language (median; grammar / vocabulary / fluency) | Questions on topic |",
      "|---|---|---|---|---|",
      ...rows.map(({ anchor, derivation: d, error }) =>
        d
          ? `| ${anchor.id} | ${anchor.expect.band} | ${d.band}${d.band === anchor.expect.band ? "" : " ✗"} | ${d.language} (${d.languageLevel}; ${d.featureLevels.grammar ?? "n/a"} / ${d.featureLevels.vocabulary ?? "n/a"} / ${d.featureLevels.fluency_coherence ?? "n/a"}) | ${d.questionsOnTopic}/3 (${d.questionStatuses.join(", ")}) |`
          : `| ${anchor.id} | ${anchor.expect.band} | ERROR | ${error} | |`,
      ),
      "",
      ...misses.flatMap(({ anchor, derivation: d, error }) => [
        `## MISS ${anchor.id} — ${anchor.description}`,
        "",
        `- Expected: ${expected(anchor)}`,
        `- Got: ${d ? describeDerivation(d) : `ERROR ${error}`}`,
        `- Why this band: ${anchor.why}`,
        "",
      ]),
    ];
    const markdown = lines.join("\n");
    const file = writeReport("band-anchors", markdown, rows.map((r) => ({ id: r.anchor.id, expect: r.anchor.expect, derivation: r.derivation, error: r.error })));
    console.log(`\n${markdown}\n\nReport: ${file}\n`);
  });
});
