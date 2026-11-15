import { describe, expect, it } from "vitest";
import { getArgumentTask } from "@/content/speaking/part3";
import { computeSpeechMetrics } from "@/domain/speaking/metrics";
import { getEnv } from "@/server/config/env";
import { evaluateArgument, type ArgumentEvaluation } from "@/server/evaluation/argument-evaluator";
import { GeminiEvaluationModel } from "@/server/evaluation/gemini-evaluation-model";
import { costUsd, formatUsd, priceFor } from "@/server/evaluation/pricing";
import { getArgumentRubric } from "@/server/evaluation/rubrics/q8";
import { PART3_ANCHORS } from "../evaluation-samples/part3-anchors";
import { writeReport } from "./report";
import { streamingFetch } from "./stream-fetch";

/**
 * The Part 3 anchors on the REAL Gemini evaluator (transcript step only), as the app now sends them: no ticked points
 * (the tick step was removed on 2026-11-15; the evaluator never used them). Prints expected vs actual band, coverage,
 * dependence, the four language levels, tokens, time and cost, and saves the results to eval-reports/.
 *
 *   EVAL_P3_ANCHORS=1 EVALUATION_PROVIDER=gemini EVAL_STREAM=1 npx vitest run --config vitest.live.config.mts test/live/part3-anchors.live.test.ts
 *   EVAL_P3_ONLY=cars-A2,tax-A5 …   # some anchors (comma-separated ids)
 *
 * Costs money (about $0.03 per anchor). Speaking time is estimated from the word count (2.2 words a second, at most 120 s).
 */
const env = getEnv();
const live = env.EVALUATION_PROVIDER === "gemini" && Boolean(env.GEMINI_API_KEY) && process.env.EVAL_P3_ANCHORS === "1";
const only = process.env.EVAL_P3_ONLY?.split(",").map((s) => s.trim()).filter(Boolean);

type Result = { scoring: { band: number; coverage: string; dependence: string }; assessment: { features: Record<string, { level: string }> } };

describe.skipIf(!live)("LIVE: Part 3 anchors (gemini)", () => {
  it("scores each Part 3 anchor and reports bands, time and cost", async () => {
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
    const anchors = PART3_ANCHORS.filter((a) => !only || only.includes(a.id));

    const rows = await Promise.all(
      anchors.map(async (anchor) => {
        const task = getArgumentTask(anchor.taskId)!;
        const words = anchor.transcript.split(/\s+/).filter(Boolean).length;
        const durationMs = Math.round(Math.min(120, Math.max(10, words / 2.2)) * 1000);
        const t0 = Date.now();
        try {
          const e: ArgumentEvaluation = await evaluateArgument(
            {
              task,
              rubric: getArgumentRubric(task),
              transcript: anchor.transcript,
              metrics: computeSpeechMetrics(anchor.transcript, durationMs, task.speakingSeconds),
              chosenPoints: [],
              audio: { storageProvider: "test", storageKey: "k", mimeType: "audio/webm", durationMs },
              previousAttempt: null,
            },
            model,
          );
          return { anchor, e, seconds: (Date.now() - t0) / 1000, error: null as string | null };
        } catch (error) {
          return { anchor, e: null, seconds: (Date.now() - t0) / 1000, error: (error as Error).message };
        }
      }),
    );

    const lines = [
      `Model ${model.model} · thinking ${env.GEMINI_THINKING_LEVEL} · prices ${price ? `$${price.inputPerMillion}/M in, $${price.outputPerMillion}/M out` : "unknown"}`,
      "",
      "| Anchor | Expected | Band | Coverage (exp → got) | Dependence (exp → got) | Levels (grammar/vocab/cohesion/fluency) | Calls | Tokens out | Time | Cost |",
      "|---|---|---|---|---|---|---|---|---|---|",
    ];
    let total = 0;
    let exact = 0;
    let within1 = 0;
    for (const { anchor, e, seconds, error } of rows) {
      if (!e) {
        lines.push(`| ${anchor.id} | ${anchor.expected.band} | ERROR | ${error?.slice(0, 80)} | | | | | ${seconds.toFixed(0)} s | |`);
        continue;
      }
      const r = e.result as unknown as Result;
      const cost = costUsd(e, price) ?? 0;
      total += cost;
      if (r.scoring.band === anchor.expected.band) exact++;
      if (Math.abs(r.scoring.band - anchor.expected.band) <= 1) within1++;
      const f = r.assessment.features;
      lines.push(
        `| ${anchor.id} | ${anchor.expected.band} | ${r.scoring.band} | ${anchor.expected.coverage} → ${r.scoring.coverage} | ${anchor.expected.codeDependence} → ${r.scoring.dependence} | ${["grammar", "vocabulary", "cohesion", "fluency"].map((k) => f[k]?.level ?? "?").join(" / ")} | ${e.modelCalls} | ${e.outputTokens ?? "?"} | ${seconds.toFixed(0)} s | ${formatUsd(cost)} |`,
      );
    }
    lines.push("", `Exact: ${exact} of ${rows.length} · within one band: ${within1} of ${rows.length} · total ${formatUsd(total)}`);
    const md = lines.join("\n");
    console.log(`\n${md}\n`);
    console.log(`Report: ${writeReport("part3-anchors", md, rows.map(({ anchor, e, seconds, error }) => ({ id: anchor.id, expected: anchor.expected, result: e?.result ?? null, seconds, error })))}`);
    expect(rows.length).toBeGreaterThan(0);
  });
});
