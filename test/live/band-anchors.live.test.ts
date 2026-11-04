import { describe, expect, it } from "vitest";
import { getSpeakingTask } from "@/content/speaking";
import { computeSpeechMetrics } from "@/domain/speaking/metrics";
import { getEvaluationModel } from "@/server/evaluation";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { evaluateSpeaking } from "@/server/evaluation/speaking-evaluator";
import { deriveBand, describeDerivation, type BandDerivation } from "../evaluation-samples/part2-band";
import { PART2_BAND_ANCHORS, type BandAnchor } from "../evaluation-samples/part2-band-anchors";
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
 */
const selection = evaluatorSelection();
const task = getSpeakingTask("b2-part2-technology-young-people")!;
const only = process.env.EVAL_SAMPLES?.split(",").map((s) => s.trim()).filter(Boolean);
const anchors = PART2_BAND_ANCHORS.filter((a) => !only?.length || only.some((prefix) => a.id.startsWith(prefix)));

interface Row {
  anchor: BandAnchor;
  derivation?: BandDerivation;
  error?: string;
}

describe.skipIf(!selection.configured || anchors.length === 0)("LIVE: Part 2 band anchors (exact band)", () => {
  const rows: Row[] = [];

  it.each(anchors.map((a) => [a.id, a] as const))("%s", async (_id, anchor) => {
    const row: Row = { anchor };
    rows.push(row);
    try {
      const evaluation = await evaluateSpeaking(
        {
          task,
          rubric: getSpeakingRubric(task),
          transcript: anchor.transcript,
          metrics: computeSpeechMetrics(anchor.transcript, anchor.durationMs, task.speakingSeconds),
          audio: { storageProvider: "none", storageKey: anchor.id, mimeType: "audio/webm", durationMs: anchor.durationMs },
          previousAttempt: null,
        },
        getEvaluationModel(),
      );
      row.derivation = deriveBand(evaluation.result);
    } catch (error) {
      row.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      throw error;
    }
    expect(row.derivation.band, `${anchor.id}: expected band ${anchor.expect.band}, got ${describeDerivation(row.derivation)}`).toBe(anchor.expect.band);
  });

  it("writes the band anchor report", () => {
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
