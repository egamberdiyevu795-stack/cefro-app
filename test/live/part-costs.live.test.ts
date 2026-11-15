import { describe, expect, it } from "vitest";
import { getSpeakingTask } from "@/content/speaking";
import { getArgumentTask } from "@/content/speaking/part3";
import { computeSpeechMetrics } from "@/domain/speaking/metrics";
import { getEnv } from "@/server/config/env";
import { evaluateArgument } from "@/server/evaluation/argument-evaluator";
import { GeminiEvaluationModel } from "@/server/evaluation/gemini-evaluation-model";
import { costUsd, formatUsd, priceFor } from "@/server/evaluation/pricing";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { getArgumentRubric } from "@/server/evaluation/rubrics/q8";
import { evaluateSpeaking } from "@/server/evaluation/speaking-evaluator";
import { PART1_ANCHORS } from "../evaluation-samples/part1-anchors";
import { PART3_ANCHORS } from "../evaluation-samples/part3-anchors";
import { writeReport } from "./report";
import { streamingFetch } from "./stream-fetch";

/**
 * One real call per scored part of a full mock (1.1, 1.2, 3; Part 2 comes from the evaluation set), to measure what a
 * scoring costs on the production model. Transcript step only: no audio step and no speech-to-text (those need a
 * recording). Bands are printed for information, not asserted (Parts 1 and 3 have no live anchor run yet).
 *
 *   EVAL_PART_COSTS=1 EVALUATION_PROVIDER=gemini EVAL_STREAM=1 npx vitest run --config vitest.live.config.mts test/live/part-costs.live.test.ts
 *
 * Costs money (about $0.10). EVAL_STREAM=1 as in the evaluation set (test/live/stream-fetch.ts).
 */
const env = getEnv();
const live = env.EVALUATION_PROVIDER === "gemini" && Boolean(env.GEMINI_API_KEY) && process.env.EVAL_PART_COSTS === "1";

describe.skipIf(!live)("LIVE: cost of one scoring per part (gemini)", () => {
  it("scores one Part 1.1, one Part 1.2 and one Part 3 answer and reports tokens and cost", async () => {
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
    const audio = (durationMs: number) => ({ storageProvider: "test", storageKey: "k", mimeType: "audio/webm", durationMs });
    const rows: {
      part: string;
      anchor: string;
      expected: number;
      band: unknown;
      input: number | null;
      output: number | null;
      calls: number;
      cost: number | null;
      seconds: number;
    }[] = [];

    for (const id of ["1.1-middle", "1.2-middle"]) {
      const anchor = PART1_ANCHORS.find((a) => a.id === id)!;
      const task = getSpeakingTask(anchor.part === "1.1" ? "a2-part1-1-daily-life" : "b1-part1-2-shopping")!;
      const transcript = anchor.answers.join(" ");
      const durationMs = anchor.part === "1.1" ? 75_000 : 90_000;
      const t0 = Date.now();
      const e = await evaluateSpeaking(
        {
          task,
          rubric: getSpeakingRubric(task),
          transcript,
          metrics: computeSpeechMetrics(transcript, durationMs, task.speakingSeconds),
          audio: audio(durationMs),
          previousAttempt: null,
        },
        model,
      );
      rows.push({
        part: anchor.part,
        anchor: id,
        expected: anchor.band,
        band: e.result.scoring.band,
        input: e.inputTokens,
        output: e.outputTokens,
        calls: e.modelCalls,
        cost: costUsd(e, price),
        seconds: (Date.now() - t0) / 1000,
      });
    }

    const p3 = PART3_ANCHORS.find((a) => a.id === "cars-A4")!;
    const task3 = getArgumentTask(p3.taskId)!;
    const t0 = Date.now();
    const e3 = await evaluateArgument(
      {
        task: task3,
        rubric: getArgumentRubric(task3),
        transcript: p3.transcript,
        metrics: computeSpeechMetrics(p3.transcript, 115_000, task3.speakingSeconds),
        chosenPoints: ["F1", "F2", "A1", "A2"],
        audio: audio(115_000),
        previousAttempt: null,
      },
      model,
    );
    rows.push({
      part: "3",
      anchor: p3.id,
      expected: p3.expected.band,
      band: (e3.result as unknown as { scoring?: { band?: number } }).scoring?.band,
      input: e3.inputTokens,
      output: e3.outputTokens,
      calls: e3.modelCalls,
      cost: costUsd(e3, price),
      seconds: (Date.now() - t0) / 1000,
    });

    const md = [
      `Model ${model.model} · thinking ${env.GEMINI_THINKING_LEVEL} · prices ${price ? `$${price.inputPerMillion}/M in, $${price.outputPerMillion}/M out` : "unknown"}`,
      "",
      "| Part | Anchor | Expected band | Band | Tokens in/out | Calls | Time | Cost |",
      "|---|---|---|---|---|---|---|---|",
      ...rows.map(
        (r) =>
          `| ${r.part} | ${r.anchor} | ${r.expected} | ${r.band ?? "?"} | ${r.input}/${r.output} | ${r.calls} | ${r.seconds.toFixed(1)}s | ${formatUsd(r.cost)} |`,
      ),
    ].join("\n");
    console.log(`\n${md}\n`);
    console.log(`Report: ${writeReport("part-costs", md, rows)}`);
    expect(rows).toHaveLength(3);
  });
});
