import { describe, expect, it } from "vitest";
import { getSpeakingTask } from "@/content/speaking";
import { computeSpeechMetrics, tokenizeWords, withQuestionTimes } from "@/domain/speaking/metrics";
import { getEnv } from "@/server/config/env";
import { GeminiEvaluationModel } from "@/server/evaluation/gemini-evaluation-model";
import { costUsd, formatUsd, priceFor } from "@/server/evaluation/pricing";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { evaluateSpeaking, type SpeakingEvaluation } from "@/server/evaluation/speaking-evaluator";
import { PART1_ANCHORS } from "../evaluation-samples/part1-anchors";
import { writeReport } from "./report";
import { streamingFetch } from "./stream-fetch";

/**
 * The six Part 1 anchors (1.1 low / middle / high, 1.2 low / middle / high) on the REAL Gemini evaluator, transcript
 * step only, each scored EVAL_REPEAT times (default 1). Prints expected vs actual band, the four levels, tokens, time and
 * cost, and saves the full results to eval-reports/ in the evaluation-set shape (so scripts/check-feedback-review.mjs
 * reads it).
 *
 *   EVAL_P1_ANCHORS=1 EVALUATION_PROVIDER=gemini EVAL_STREAM=1 npx vitest run --config vitest.live.config.mts test/live/part1-anchors.live.test.ts
 *   EVAL_P1_ONLY=1.2-middle …   # one anchor (comma-separated ids)
 *
 * Costs money (about $0.25 for the six). The metrics carry question offsets, as the app's do (attempt-processing.ts):
 * each answer's length is estimated from its word count, capped at its speaking time.
 */
const env = getEnv();
const live = env.EVALUATION_PROVIDER === "gemini" && Boolean(env.GEMINI_API_KEY) && process.env.EVAL_P1_ANCHORS === "1";
const REPEAT = Math.max(1, Math.min(3, Number(process.env.EVAL_REPEAT || 1)));
const only = process.env.EVAL_P1_ONLY?.split(",").map((s) => s.trim()).filter(Boolean);

describe.skipIf(!live)("LIVE: Part 1 anchors (gemini)", () => {
  it("scores each Part 1 anchor and reports bands, time and cost", async () => {
    const model = new GeminiEvaluationModel({
      apiKey: env.GEMINI_API_KEY!,
      model: env.GEMINI_EVALUATION_MODEL,
      maxTokens: env.GEMINI_EVALUATION_MAX_TOKENS,
      thinkingLevel: env.GEMINI_THINKING_LEVEL,
      temperature: env.GEMINI_TEMPERATURE,
      structuredOutput: env.GEMINI_STRUCTURED_OUTPUT,
      timeoutMs: env.EVALUATION_TIMEOUT_MS,
      maxRetries: 0,
      ...(process.env.EVAL_STREAM === "1" ? { fetch: streamingFetch } : {}),
    });
    const price = priceFor(model.model);
    const anchors = PART1_ANCHORS.filter((a) => !only || only.includes(a.id));

    const rows = await Promise.all(
      anchors.map(async (anchor) => {
        const task = getSpeakingTask(anchor.part === "1.1" ? "a2-part1-1-daily-life" : "b1-part1-2-shopping")!;
        const limits = task.delivery!.questions.map((q) => q.speakingSeconds);
        const answerMs = anchor.answers.map((a, i) => Math.round(Math.min(limits[i], Math.max(4, tokenizeWords(a).length / 2.2)) * 1000));
        const offsets = answerMs.map((_, i) => answerMs.slice(0, i).reduce((s, n) => s + n, 0));
        const durationMs = answerMs.reduce((s, n) => s + n, 0);
        const transcript = anchor.answers.join(" ");
        const runs: { e: SpeakingEvaluation | null; seconds: number; error: string | null }[] = [];
        for (let r = 0; r < REPEAT; r++) {
          const t0 = Date.now();
          try {
            const e = await evaluateSpeaking(
              {
                task,
                rubric: getSpeakingRubric(task),
                transcript,
                metrics: withQuestionTimes(computeSpeechMetrics(transcript, durationMs, task.speakingSeconds), offsets, durationMs),
                audio: { storageProvider: "test", storageKey: "k", mimeType: "audio/webm", durationMs },
                previousAttempt: null,
              },
              model,
            );
            runs.push({ e, seconds: (Date.now() - t0) / 1000, error: null });
          } catch (error) {
            runs.push({ e: null, seconds: (Date.now() - t0) / 1000, error: (error as Error).message });
          }
        }
        return { anchor, runs };
      }),
    );

    const lines = [
      `Model ${model.model} · thinking ${env.GEMINI_THINKING_LEVEL} · prices ${price ? `$${price.inputPerMillion}/M in, $${price.outputPerMillion}/M out` : "unknown"}`,
      "",
      "| Anchor | Expected | Band | Statuses | Levels (g/v/f/c) | Tokens in/out | Calls | Time | Cost |",
      "|---|---|---|---|---|---|---|---|---|",
    ];
    let total = 0;
    for (const { anchor, runs } of rows) {
      for (const { e, seconds, error } of runs) {
        if (!e) {
          lines.push(`| ${anchor.id} | ${anchor.band} | error | ${error} | | | | ${seconds.toFixed(1)}s | |`);
          continue;
        }
        const a = e.result.assessment;
        const f = a.features;
        const cost = costUsd(e, price);
        total += cost ?? 0;
        lines.push(
          `| ${anchor.id} | ${anchor.band} | ${e.result.scoring.band} | ${a.questions.map((q) => q.status).join(", ")} | ${[f.grammar?.level, f.vocabulary?.level, f.fluency?.level, f.cohesion?.level ?? "-"].join("/")} | ${e.inputTokens}/${e.outputTokens} | ${e.modelCalls} | ${seconds.toFixed(1)}s | ${formatUsd(cost)} |`,
        );
      }
    }
    lines.push("", `Total cost: ${formatUsd(total)}`);
    const md = lines.join("\n");
    console.log(`\n${md}\n`);
    const data = rows.map(({ anchor, runs }) => ({
      id: anchor.id,
      expected: anchor.band,
      bands: runs.map((r) => r.e?.result.scoring.band ?? null),
      seconds: runs.map((r) => r.seconds),
      errors: runs.map((r) => r.error),
      results: runs.map((r) => r.e?.result ?? null),
      quality: runs.map((r) => r.e?.quality ?? null),
      tokens: runs.map((r) => (r.e ? { input: r.e.inputTokens, output: r.e.outputTokens, calls: r.e.modelCalls } : null)),
    }));
    console.log(`Report: ${writeReport("part1-anchors", md, data)}`);
    expect(rows.length).toBe(anchors.length);
  });
});
