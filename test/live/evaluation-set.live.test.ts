import { describe, expect, it } from "vitest";
import { getSpeakingTask } from "@/content/speaking";
import { FEATURES, levelValue } from "@/domain/evaluation/multilevel/levels";
import type { MultilevelResult } from "@/domain/evaluation/multilevel/result";
import { compareAttempts } from "@/domain/speaking/comparison";
import { computeSpeechMetrics } from "@/domain/speaking/metrics";
import type { SpeakingTask } from "@/domain/speaking/task";
import { getEnv } from "@/server/config/env";
import { ProviderError } from "@/server/errors";
import { getEvaluationModel } from "@/server/evaluation";
import { GeminiEvaluationModel } from "@/server/evaluation/gemini-evaluation-model";
import type { EvaluationModel } from "@/server/evaluation/types";
import { costUsd, formatUsd, priceFor } from "@/server/evaluation/pricing";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { evaluateSpeaking, type SpeakingEvaluation } from "@/server/evaluation/speaking-evaluator";
import type { EvaluationInput } from "@/server/evaluation/types";
import { B2_PART2_SAMPLES, type EvaluationSample } from "../evaluation-samples/b2-part2-samples";
import { PART2_BAND_ANCHORS, PART2_INJECTION_PROBE, type BandAnchor } from "../evaluation-samples/part2-band-anchors";
import { PART2_NEW_TASK_ANCHORS } from "../evaluation-samples/part2-new-task-anchors";
import { LIVE_36_FLASH_FIXTURES } from "../fixtures/live-3.6-flash";
import { calibrate, dryRunReport, type PlannedEvaluation } from "./dry-run";
import { TECHNOLOGY_TASK } from "../evaluation-samples/technology-task";
import { renderMultilevelResult } from "./checks";
import { evaluatorSelection } from "./providers";
import { writeReport } from "./report";

/**
 * The live evaluation set on the REAL configured evaluator, every sample evaluated EVAL_REPEAT times (default 3):
 *
 * - Part 2 band anchors (advice task): EVERY run must hit the exact expected band (hard).
 * - Part 2 new-task anchors (test/evaluation-samples/part2-new-task-anchors.ts: 12 answers, 2 for each of the 6 newer
 *   tasks, each sent with ITS OWN task): EVERY run must hit the exact expected band (hard). Not yet live-tested.
 * - S01–S15 (former technology task, ./technology-task.ts): loose expectations, reported for review (soft).
 * - Stability: any sample whose band changes between runs is listed.
 * - Hard safety checks: quality gate passes, pronunciation never judged from text, injected instructions ignored.
 * - Soft: weak → strong retry (A2 → A4) compared honestly.
 *
 *   EVALUATION_PROVIDER=gemini GEMINI_API_KEY=... npm run eval:live
 *   EVAL_SAMPLES=A2,S15 EVAL_REPEAT=1 npm run eval:live     # subset (id prefixes; P1 = injection, RETRY = retry pair)
 *   npm run eval:live:part2                                 # the 8 Part 2 anchors + S15, ×3 (EVAL_SAMPLES=A,S15)
 *   npm run eval:live:new-tasks                             # the 12 new-task anchors, ×3 (EVAL_SAMPLES=NEW)
 *   EVALUATION_PROVIDER=gemini npm run eval:live -- --dry-run  # what it WOULD send and the estimated cost; no model call
 *
 * EVAL_SAMPLES takes id prefixes; NEW selects all 12 new-task anchors (D… G… T… F… R… H…; use full ids for one task,
 * e.g. R4,R1, since "R" alone also matches RETRY).
 *   GEMINI_THINKING_LEVEL=medium GEMINI_EVALUATION_MAX_TOKENS=12000 npm run eval:live
 *
 * The report gives every run's band, feature levels, question statuses, time and estimated cost, plus the total
 * (src/server/evaluation/pricing.ts; override prices with EVAL_PRICE_INPUT_PER_M / EVAL_PRICE_OUTPUT_PER_M).
 *
 * Keys are read from the environment and never printed.
 *
 * Rate-limited (e.g. free-tier) runs, test-only switches, all off by default:
 *   EVAL_SEQUENTIAL=1     every evaluation one at a time (repeats are otherwise sent in parallel)
 *   EVAL_PAUSE_MS=8000    pause between evaluations (stay under the per-minute request limit)
 *   EVAL_SDK_RETRIES=0    Gemini only: same client as the app, but the SDK's automatic 408/429/5xx retries are off.
 *                         Instead a 429 waits (Google's "retry in Ns", else 65 s) and is retried ONCE; a second 429,
 *                         or a per-day / zero quota, stops every remaining evaluation and the report says what finished.
 */
const selection = evaluatorSelection();
/** `--dry-run` (scripts/eval-live.mjs sets EVAL_DRY_RUN=1): build and print what would be sent; never call a model. */
const DRY_RUN = process.env.EVAL_DRY_RUN === "1";
if (!selection.configured && !DRY_RUN) console.log(`\nLIVE evaluation skipped: ${selection.hint}\n`);
const REPEAT = Math.max(1, Math.min(5, Number(process.env.EVAL_REPEAT || 3)));
const adviceTask = getSpeakingTask("b2-part2-advice-from-someone")!;
const only = process.env.EVAL_SAMPLES?.split(",").map((s) => s.trim()).filter(Boolean);
const selected = (id: string) => !only?.length || only.some((prefix) => id.startsWith(prefix));
const anchors = PART2_BAND_ANCHORS.filter((a) => selected(a.id));
const newTaskAnchors = PART2_NEW_TASK_ANCHORS.filter((a) => selected(a.id) || Boolean(only?.includes("NEW")));
const taskOf = (taskId: string) => {
  const task = getSpeakingTask(taskId);
  if (!task) throw new Error(`unknown task ${taskId}`);
  return task;
};
const samples = B2_PART2_SAMPLES.filter((s) => selected(s.id));
const runInjection = selected(PART2_INJECTION_PROBE.id);
const runRetry = selected("RETRY");
const anchorById = (prefix: string) => PART2_BAND_ANCHORS.find((a) => a.id.startsWith(prefix))!;

const SEQUENTIAL = process.env.EVAL_SEQUENTIAL === "1";
const PAUSE_MS = Math.max(0, Number(process.env.EVAL_PAUSE_MS || 0));
const NO_SDK_RETRIES = process.env.EVAL_SDK_RETRIES === "0";

/** The configured evaluator; with EVAL_SDK_RETRIES=0 (Gemini) the same client with the SDK's retries switched off. */
function liveModel(): EvaluationModel {
  const env = getEnv();
  if (!NO_SDK_RETRIES || env.EVALUATION_PROVIDER !== "gemini" || !env.GEMINI_API_KEY) return getEvaluationModel();
  return new GeminiEvaluationModel({
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_EVALUATION_MODEL,
    maxTokens: env.GEMINI_EVALUATION_MAX_TOKENS,
    thinkingLevel: env.GEMINI_THINKING_LEVEL,
    temperature: env.GEMINI_TEMPERATURE,
    structuredOutput: env.GEMINI_STRUCTURED_OUTPUT,
    timeoutMs: env.EVALUATION_TIMEOUT_MS,
    maxRetries: 0,
  });
}

/** Requests sent (model calls incl. regenerations, plus rate-limited and failed ones) and why the run stopped, if it did. */
const pacing = { requests: 0, rateLimited: 0, lastEndedAt: 0, stopped: null as string | null };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function rateLimitInfo(error: unknown): { daily: boolean; zero: boolean; waitMs: number } | null {
  if (!(error instanceof ProviderError) || error.failureCode !== "provider_rate_limited") return null;
  const text = error.message;
  const retryIn = /retry in ([\d.]+)\s*s/i.exec(text);
  return {
    daily: /per ?day|PerDay|daily/i.test(text),
    zero: /limit:\s*0\b/.test(text),
    waitMs: retryIn ? Math.ceil(Number(retryIn[1]) * 1000) + 5_000 : 65_000,
  };
}

/** One evaluation, paced; a 429 is waited out and retried once (see the header). */
async function pacedEvaluate(input: EvaluationInput): Promise<SpeakingEvaluation> {
  for (let attempt = 1; ; attempt++) {
    if (pacing.stopped) throw new Error(`not run: ${pacing.stopped}`);
    const wait = pacing.lastEndedAt + PAUSE_MS - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      const result = await evaluateSpeaking(input, liveModel());
      pacing.requests += result.modelCalls;
      return result;
    } catch (error) {
      pacing.requests += 1;
      const limit = rateLimitInfo(error);
      if (!limit || !NO_SDK_RETRIES) throw error;
      pacing.rateLimited += 1;
      if (limit.daily || limit.zero || attempt > 1) {
        pacing.stopped = limit.daily ? "daily request limit reached (429)" : limit.zero ? "quota is 0 for this model (429)" : "rate limited twice in a row (429)";
        throw error;
      }
      console.log(`429 rate limit: waiting ${Math.round(limit.waitMs / 1000)} s, then one retry`);
      await sleep(limit.waitMs);
    } finally {
      pacing.lastEndedAt = Date.now();
    }
  }
}

function inputFor(
  task: SpeakingTask,
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

/** One line: band, per-feature levels, question statuses, zero reason and biggest fix. */
function judgements(r: MultilevelResult): string {
  const s = r.scoring;
  const features = FEATURES.filter((f) => f !== "pronunciation").map((f) => `${f}=${r.assessment.features[f].level}`).join(", ");
  const questions = r.assessment.questions.map((q) => `Q${q.id}=${q.status}`).join(", ");
  const fix = s.biggest_fix.kind === "feature" ? s.biggest_fix.feature : s.biggest_fix.kind === "question_coverage" ? `Q${s.biggest_fix.question_id}` : "own words";
  return `band ${s.band} · language ${s.language_level} (mean ${s.language_mean}; ${features}) · ${s.on_topic_count}/3 on topic (${questions})${s.zero_reason ? ` · zero: ${s.zero_reason}` : ""} · fix: ${fix}`;
}

interface Row {
  id: string;
  kind: "anchor" | "sample";
  description: string;
  expected: string;
  runs: SpeakingEvaluation[];
  errors: string[];
  /** Expectation misses (anchors: wrong bands; samples: soft misses). */
  misses: string[];
  why?: string;
}

const bandsOf = (row: Row) => row.runs.map((e) => e.result.scoring.band);
const unstable = (row: Row) => new Set(bandsOf(row)).size > 1;

/** Evaluate one sample REPEAT times in parallel; failed calls are recorded, not thrown, so every run is reported. */
async function evaluateRepeated(task: SpeakingTask, sample: { id: string; transcript: string; durationMs: number }, row: Row) {
  const run = () => pacedEvaluate(inputFor(task, sample));
  const settled: PromiseSettledResult<SpeakingEvaluation>[] = [];
  if (SEQUENTIAL) for (let i = 0; i < REPEAT; i++) settled.push(...(await Promise.allSettled([run()])));
  else settled.push(...(await Promise.allSettled(Array.from({ length: REPEAT }, run))));
  for (const s of settled) {
    if (s.status === "fulfilled") row.runs.push(s.value);
    else row.errors.push(s.reason instanceof Error ? `${s.reason.name}: ${s.reason.message}` : String(s.reason));
  }
}

function softMisses(sample: EvaluationSample, r: MultilevelResult): string[] {
  const misses: string[] = [];
  const e = sample.expect;
  const band = r.scoring.band;
  if (band < e.band[0] || band > e.band[1]) misses.push(`band ${band} outside ${e.band[0]}–${e.band[1]}`);
  if (e.weakFeatures && !e.weakFeatures.some((f) => {
    const l = r.assessment.features[f].level;
    return l !== "not_assessed" && levelValue(l) <= levelValue("B1");
  })) misses.push(`none of ${e.weakFeatures.join("/")} judged B1 or below`);
  for (const [f, level] of Object.entries(e.levels ?? {})) {
    const actual = r.assessment.features[f as keyof typeof r.assessment.features].level;
    if (actual !== level) misses.push(`${f} ${actual} ≠ ${level}`);
  }
  if (e.biggestFix && !(r.scoring.biggest_fix.kind === "feature" && r.scoring.biggest_fix.feature === e.biggestFix)) misses.push(`biggest fix is not ${e.biggestFix}`);
  if (e.biggestFix && !r.retry_focus.some((f) => f.target.kind === "feature" && f.target.feature === e.biggestFix)) misses.push(`${e.biggestFix} not in the retry focus`);
  if (e.zeroReason && r.scoring.zero_reason !== e.zeroReason) misses.push(`zero reason ${r.scoring.zero_reason ?? "none"} ≠ ${e.zeroReason}`);
  if (e.coverageIssue && r.scoring.on_topic_count === r.assessment.questions.length) misses.push("expected a question not on topic");
  for (const [id, status] of Object.entries(e.coverage ?? {})) {
    const actual = r.assessment.questions.find((q) => q.id === Number(id))?.status;
    if (actual !== status) misses.push(`question ${id} ${actual ?? "absent"} ≠ ${status}`);
  }
  if (e.lowBand && band > 1) misses.push(`expected band ≤ 1, got ${band}`);
  return misses;
}

const anchorExpected = (a: BandAnchor) =>
  `band ${a.expect.band} · language ${a.expect.language} · ${a.expect.questions.map((q, i) => `Q${i + 1}=${q}`).join(", ")}${a.expect.memorized ? " · memorized" : ""}`;

const nothingSelected = anchors.length + newTaskAnchors.length + samples.length + Number(runInjection) + Number(runRetry) === 0;

const retryLines: string[] = [];

/** Everything the run below sends, in order, with how many times: the dry run prints this. */
function plannedEvaluations(): PlannedEvaluation[] {
  return [
    ...anchors.map((a) => ({ id: a.id, group: "advice anchor" as const, input: inputFor(adviceTask, a), runs: REPEAT })),
    ...newTaskAnchors.map((a) => ({ id: a.id, group: "new-task anchor" as const, input: inputFor(taskOf(a.taskId), a), runs: REPEAT })),
    ...samples.map((s) => ({ id: s.id, group: "sample" as const, input: inputFor(TECHNOLOGY_TASK, s), runs: REPEAT })),
    ...(runInjection ? [{ id: PART2_INJECTION_PROBE.id, group: "injection probe" as const, input: inputFor(adviceTask, PART2_INJECTION_PROBE), runs: 1 }] : []),
    ...(runRetry
      ? [
          { id: "RETRY A2", group: "retry pair" as const, input: inputFor(adviceTask, anchorById("A2")), runs: 1 },
          // The real retry also carries the first answer's goal (known only after it is scored); none here.
          { id: "RETRY A4", group: "retry pair" as const, input: inputFor(adviceTask, anchorById("A4"), { attemptNumber: 1, transcript: anchorById("A2").transcript, retryFocus: [] }), runs: 1 },
        ]
      : []),
  ];
}

describe.runIf(DRY_RUN)("DRY RUN: what the live evaluation set would send (no model call)", () => {
  it("prints every evaluation it would send and the estimated cost", () => {
    const provider = process.env.EVALUATION_PROVIDER || "anthropic";
    const model =
      provider === "gemini" ? process.env.GEMINI_EVALUATION_MODEL || "gemini-3.8-flash" : process.env.ANTHROPIC_EVALUATION_MODEL || "claude-opus-5-5";
    const calibration = calibrate(Object.values(LIVE_36_FLASH_FIXTURES), (id) => {
      const anchor = PART2_BAND_ANCHORS.find((a) => a.id === id);
      return anchor ? inputFor(adviceTask, anchor) : null;
    });
    const { summary, full, totals } = dryRunReport(plannedEvaluations(), { provider, model, repeat: REPEAT, price: priceFor(model), calibration });
    const file = writeReport("evaluation-set-dry-run", full, { provider, model, repeat: REPEAT, totals, calibration });
    console.log(`\n${summary}\n\nEvery prompt in full: ${file}\n`);
    expect(totals.evaluations).toBeGreaterThanOrEqual(0);
  });
});

describe.skipIf(DRY_RUN || !selection.configured || nothingSelected)(`LIVE: evaluation set (×${REPEAT} runs per sample)`, () => {
  const rows: Row[] = [];

  it.each(anchors.map((a) => [a.id, a] as const))("anchor %s: every run hits the exact band", async (_id, anchor) => {
    const row: Row = { id: anchor.id, kind: "anchor", description: anchor.description, expected: anchorExpected(anchor), runs: [], errors: [], misses: [], why: anchor.why };
    rows.push(row);
    await evaluateRepeated(adviceTask, anchor, row);
    row.runs.forEach((e, i) => {
      if (e.result.scoring.band !== anchor.expect.band) row.misses.push(`run ${i + 1}: ${judgements(e.result)}`);
    });
    expect(row.errors, `${anchor.id}: failed evaluations`).toEqual([]);
    for (const e of row.runs) {
      expect(e.quality.passed).toBe(true);
      expect(e.result.assessment.features.pronunciation.level).toBe("not_assessed");
    }
    expect(row.misses, `${anchor.id}: expected ${row.expected}`).toEqual([]);
  });

  it.each(newTaskAnchors.map((a) => [a.id, a.taskId, a] as const))("new-task anchor %s (%s): every run hits the exact band", async (_id, taskId, anchor) => {
    const row: Row = { id: anchor.id, kind: "anchor", description: `${taskId}: ${anchor.description}`, expected: anchorExpected(anchor), runs: [], errors: [], misses: [], why: anchor.why };
    rows.push(row);
    await evaluateRepeated(taskOf(taskId), anchor, row);
    row.runs.forEach((e, i) => {
      if (e.result.scoring.band !== anchor.expect.band) row.misses.push(`run ${i + 1}: ${judgements(e.result)}`);
    });
    expect(row.errors, `${anchor.id}: failed evaluations`).toEqual([]);
    for (const e of row.runs) {
      expect(e.quality.passed).toBe(true);
      expect(e.result.assessment.features.pronunciation.level).toBe("not_assessed");
    }
    expect(row.misses, `${anchor.id}: expected ${row.expected}`).toEqual([]);
  });

  it.each(samples.map((s) => [s.id, s] as const))("sample %s (soft expectations)", async (_id, sample) => {
    const row: Row = { id: sample.id, kind: "sample", description: sample.description, expected: `band ${sample.expect.band.join("–")}`, runs: [], errors: [], misses: [], why: sample.expect.note };
    rows.push(row);
    await evaluateRepeated(TECHNOLOGY_TASK, sample, row);
    row.runs.forEach((e, i) => softMisses(sample, e.result).forEach((m) => row.misses.push(`run ${i + 1}: ${m}`)));
    // Hard rules only: misses above are for review and do not fail the run.
    expect(row.errors, `${sample.id}: failed evaluations`).toEqual([]);
    for (const e of row.runs) {
      expect(e.quality.passed).toBe(true);
      expect(e.result.assessment.features.pronunciation.level).toBe("not_assessed");
      if (sample.id.startsWith("S13")) expect(e.result.scoring.band, judgements(e.result)).toBeLessThanOrEqual(2);
    }
  });

  it.skipIf(!runInjection)(`${PART2_INJECTION_PROBE.id}: an instruction inside the transcript is ignored`, async () => {
    const { result } = await pacedEvaluate(inputFor(adviceTask, PART2_INJECTION_PROBE));
    expect(result.scoring.band, judgements(result)).toBeLessThanOrEqual(2);
  });

  // Soft check: reported for review, does not fail the run.
  it.skipIf(!runRetry)("RETRY A2 → A4: a weak → strong retry is reviewed and compared honestly", async () => {
    const first = await pacedEvaluate(inputFor(adviceTask, anchorById("A2")));
    const second = await pacedEvaluate(
      inputFor(adviceTask, anchorById("A4"), { attemptNumber: 1, transcript: anchorById("A2").transcript, retryFocus: first.result.retry_focus }),
    );
    const verdict = compareAttempts({ evaluation: first.result, metrics: null }, { evaluation: second.result, metrics: null }).verdict;
    const notes = [`verdict: ${verdict}`];
    if (!second.result.assessment.retry_review) notes.push("REVIEW: retry_review missing on a retry");
    if (!/improvement/.test(verdict)) notes.push("REVIEW: weak → strong retry not reported as an improvement");
    const fmt = (e: SpeakingEvaluation) => `${judgements(e.result)} (${(e.latencyMs / 1000).toFixed(1)}s)`;
    retryLines.push(`- A2 (first): ${fmt(first)}`, `- A4 (retry of A2): ${fmt(second)}`, `- ${notes.join("; ")}`);
    console.log(`\nRETRY A2 → A4: ${notes.join("; ")}\n`);
  });

  it.skipIf(anchors.length + newTaskAnchors.length + samples.length === 0)("writes the report", () => {
    const model = liveModel();
    const all = rows.flatMap((r) => r.runs);
    const latencies = all.map((e) => e.latencyMs).sort((a, b) => a - b);
    const avg = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : null;
    const p90 = latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.9))] : null;
    const anchorRows = rows.filter((r) => r.kind === "anchor");
    const sampleRows = rows.filter((r) => r.kind === "sample");
    const anchorPass = anchorRows.filter((r) => r.misses.length === 0 && r.errors.length === 0 && r.runs.length === REPEAT);
    const unstableRows = rows.filter(unstable);
    const sec = (ms: number | null) => (ms === null ? "n/a" : `${(ms / 1000).toFixed(1)}s`);
    const price = priceFor(model.model);
    const costOf = (e: SpeakingEvaluation) => costUsd(e, price);
    const knownCosts = all.map(costOf).filter((c): c is number => c !== null);
    const totalCost = knownCosts.reduce((a, c) => a + c, 0);
    const levelsOf = (e: SpeakingEvaluation) =>
      FEATURES.filter((f) => f !== "pronunciation").map((f) => e.result.assessment.features[f].level).join(" / ");
    const questionsOf = (e: SpeakingEvaluation) => e.result.assessment.questions.map((q) => `Q${q.id} ${q.status}`).join(", ");
    const runRows = rows.flatMap((r) =>
      r.runs.map((e, i) => {
        const s = e.result.scoring;
        const tokens = `${e.inputTokens ?? "?"}/${e.outputTokens ?? "?"}${e.modelCalls > 1 ? " (2 calls)" : ""}`;
        return `| ${r.id} | ${i + 1} | ${s.band}${s.zero_reason ? ` (${s.zero_reason})` : ""} | ${levelsOf(e)} | ${questionsOf(e)} | ${sec(e.latencyMs)} | ${tokens} | ${formatUsd(costOf(e))} |`;
      }),
    );
    const costLine = price
      ? `Estimated cost: ${formatUsd(totalCost)} in total, ${formatUsd(knownCosts.length ? totalCost / knownCosts.length : null)} per evaluation on average` +
        `${knownCosts.length < all.length ? ` (${all.length - knownCosts.length} evaluation(s) without token counts not included)` : ""}` +
        ` · prices $${price.inputPerMillion}/M input, $${price.outputPerMillion}/M output (thinking billed as output) · ${price.source}`
      : `Estimated cost: n/a (no price known for ${model.model}; set EVAL_PRICE_INPUT_PER_M and EVAL_PRICE_OUTPUT_PER_M)`;
    const fmt = (r: Row) => {
      const bands = bandsOf(r);
      const e = r.runs[0]?.result;
      const levels = e ? FEATURES.filter((f) => f !== "pronunciation").map((f) => e.assessment.features[f].level).join(" / ") : "—";
      const questions = e ? e.assessment.questions.map((q) => q.status).join(", ") : "—";
      return `| ${r.id} | ${r.expected} | ${bands.join(", ") || "—"}${r.errors.length ? ` (+${r.errors.length} failed)` : ""} | ${unstable(r) ? "**UNSTABLE**" : "stable"} | ${levels} | ${questions} | ${r.misses.length ? "✗" : "✓"} |`;
    };
    const lines = [
      "# Live evaluation set",
      "",
      `Provider: ${model.provider} · model ${model.model}${all.length ? ` (answered by: ${[...new Set(all.map((e) => e.model))].join(", ")})` : ""} · config ${JSON.stringify(model.config)} · ${REPEAT} run(s) per sample`,
      `Anchors exact on every run: ${anchorPass.length}/${anchorRows.length}${anchorPass.length === anchorRows.length ? " — PASS" : ` — FAIL (${anchorRows.filter((r) => !anchorPass.includes(r)).map((r) => r.id).join(", ")})`}`,
      `Samples whose band changes between runs: ${unstableRows.length}${unstableRows.length ? ` (${unstableRows.map((r) => `${r.id}: ${bandsOf(r).join("/")}`).join("; ")})` : ""}`,
      `S01–S15 with expectation misses (soft): ${sampleRows.filter((r) => r.misses.length).length}/${sampleRows.length}${sampleRows.some((r) => r.misses.length) ? ` (${sampleRows.filter((r) => r.misses.length).map((r) => r.id).join(", ")})` : ""}`,
      `Latency per evaluation: average ${sec(avg)}, p90 ${sec(p90)} over ${latencies.length} evaluations (target: average under 60s)`,
      `Regenerated drafts: ${all.filter((e) => e.modelCalls > 1).length} · tokens in/out: ${all.reduce((a, e) => a + (e.inputTokens ?? 0), 0)}/${all.reduce((a, e) => a + (e.outputTokens ?? 0), 0)}`,
      costLine,
      `Requests sent: ${pacing.requests} (rate-limited: ${pacing.rateLimited})${SEQUENTIAL ? ` · one at a time, ${PAUSE_MS / 1000} s pause` : ""}${NO_SDK_RETRIES ? " · SDK retries off" : ""} · stopped early: ${pacing.stopped ?? "no"}`,
      ...(retryLines.length ? ["", "## Retry pair A2 → A4", "", ...retryLines] : []),
      "",
      "| Sample | Expected | Bands per run | Stability | Language run 1 (grammar / vocabulary / fluency / cohesion) | Questions run 1 | Expectations |",
      "|---|---|---|---|---|---|---|",
      ...rows.map(fmt),
      "",
      "## Every run",
      "",
      "| Sample | Run | Band | Grammar / vocabulary / fluency / cohesion | Questions | Time | Tokens in/out | Cost |",
      "|---|---|---|---|---|---|---|---|",
      ...runRows,
      "",
      ...rows
        .filter((r) => r.misses.length || r.errors.length || unstable(r))
        .flatMap((r) => [
          `## ${r.kind === "anchor" ? "ANCHOR" : "SAMPLE"} ${r.id} — ${r.description}`,
          "",
          `- Expected: ${r.expected}`,
          ...(r.why ? [`- Why: ${r.why}`] : []),
          ...r.runs.map((e, i) => `- Run ${i + 1}: ${judgements(e.result)} (${sec(e.latencyMs)})`),
          ...r.errors.map((m) => `- Failed run: ${m}`),
          ...r.misses.map((m) => `- Miss: ${m}`),
          "",
          ...(r.runs[0] ? renderMultilevelResult(r.runs[0].result) : []),
          "",
        ]),
    ];
    const markdown = lines.join("\n");
    const file = writeReport(
      "evaluation-set",
      markdown,
      rows.map((r) => ({ id: r.id, kind: r.kind, expected: r.expected, bands: bandsOf(r), misses: r.misses, errors: r.errors, results: r.runs.map((e) => e.result), latencyMs: r.runs.map((e) => e.latencyMs),
        tokens: r.runs.map((e) => ({ input: e.inputTokens, output: e.outputTokens, calls: e.modelCalls })),
        costUsd: r.runs.map(costOf),
      })),
    );
    console.log(`\n${markdown}\n\nReport: ${file}\n`);
  });
});
