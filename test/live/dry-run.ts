/**
 * `npm run eval:live -- --dry-run`: what the live evaluation set WOULD send, and what it would cost, without calling
 * any model. Pure: it builds the same prompts the evaluator sends (`buildMultilevelEvaluationPrompt`) and estimates
 * tokens from the saved gemini-3.6-flash runs (test/fixtures/live-3.6-flash). No key is needed or read.
 *
 * Estimate:
 * - input tokens per evaluation = the prompt's characters × the tokens-per-character ratio of the saved runs (their
 *   reported input tokens ÷ the characters of the same anchors' prompts built by the current code);
 * - output tokens per evaluation (thinking included) = the saved runs' average;
 * - "if every draft is regenerated": × 2 (a draft the quality gate rejects is sent once more with the revision request).
 * The audio (pronunciation) step is not part of this set (transcripts only), so it is not counted.
 */
import { buildMultilevelEvaluationPrompt } from "@/server/evaluation/prompts/multilevel-evaluation";
import { costUsd, formatUsd, type TokenPrice } from "@/server/evaluation/pricing";
import type { EvaluationInput } from "@/server/evaluation/types";
import type { LiveFixtureFile } from "../fixtures/live-3.6-flash";

export interface PlannedEvaluation {
  /** Sample / anchor id ("D4-b2-all-three", "S15-…", "RETRY A4"). */
  id: string;
  group: "advice anchor" | "new-task anchor" | "sample" | "injection probe" | "retry pair";
  /** What is sent, exactly as the live run builds it. */
  input: EvaluationInput;
  /** How many times it is sent (EVAL_REPEAT for anchors and samples; 1 for the probe and each half of the retry pair). */
  runs: number;
}

export interface TokenCalibration {
  tokensPerChar: number;
  outputTokens: number;
  /** Where the numbers come from, printed with the estimate. */
  basis: string;
}

/** Characters of everything sent for one evaluation (system + user message). */
export function promptChars(input: EvaluationInput): number {
  const { system, user } = buildMultilevelEvaluationPrompt(input);
  return system.length + user.length;
}

/**
 * Tokens per character and output tokens from the saved live runs. `inputFor(anchorId)` rebuilds the prompt of the
 * anchor a fixture answered, with the current code.
 */
export function calibrate(fixtures: readonly LiveFixtureFile[], inputFor: (anchorId: string) => EvaluationInput | null): TokenCalibration {
  let inputTokens = 0;
  let chars = 0;
  const outputs: number[] = [];
  for (const file of fixtures) {
    const input = inputFor(file._fixture.anchor);
    if (!input) continue;
    const size = promptChars(input);
    for (const run of file.runs) {
      const { inputTokens: inTok, outputTokens: outTok, modelCalls } = run.evaluation;
      if (inTok === null || outTok === null) continue;
      // A regenerated draft reports both calls' tokens; count it per call so the ratio is per prompt.
      const calls = Math.max(1, modelCalls);
      inputTokens += inTok / calls;
      chars += size;
      outputs.push(outTok / calls);
    }
  }
  if (!outputs.length || chars === 0) throw new Error("no saved run with token counts to estimate from");
  return {
    tokensPerChar: inputTokens / chars,
    outputTokens: Math.round(outputs.reduce((a, b) => a + b, 0) / outputs.length),
    basis: `${outputs.length} saved gemini-3.6-flash runs (test/fixtures/live-3.6-flash), not the production model`,
  };
}

export interface DryRunTotals {
  evaluations: number;
  inputTokens: number;
  outputTokens: number;
  /** null when no price is known for the model. */
  costUsd: number | null;
  /** If every draft were regenerated once. */
  worstCaseUsd: number | null;
}

export function dryRunTotals(plan: readonly PlannedEvaluation[], calibration: TokenCalibration, price: TokenPrice | null): DryRunTotals {
  let inputTokens = 0;
  let outputTokens = 0;
  let evaluations = 0;
  for (const item of plan) {
    evaluations += item.runs;
    inputTokens += Math.round(promptChars(item.input) * calibration.tokensPerChar) * item.runs;
    outputTokens += calibration.outputTokens * item.runs;
  }
  const cost = costUsd({ inputTokens, outputTokens }, price);
  return { evaluations, inputTokens, outputTokens, costUsd: cost, worstCaseUsd: cost === null ? null : cost * 2 };
}

/** The dry-run report: a summary for the console and every prompt in full (for the report file). */
export function dryRunReport(
  plan: readonly PlannedEvaluation[],
  options: { provider: string; model: string; repeat: number; price: TokenPrice | null; calibration: TokenCalibration },
): { summary: string; full: string; totals: DryRunTotals } {
  const { calibration, price } = options;
  const totals = dryRunTotals(plan, calibration, price);
  const rows = plan.map((item) => {
    const chars = promptChars(item.input);
    const words = item.input.transcript.trim().split(/\s+/).filter(Boolean).length;
    const perRun = costUsd({ inputTokens: Math.round(chars * calibration.tokensPerChar), outputTokens: calibration.outputTokens }, price);
    return `| ${item.id} | ${item.group} | ${item.input.task.id} | ${item.runs} | ${words} | ${chars} | ~${Math.round(chars * calibration.tokensPerChar)} | ${formatUsd(perRun === null ? null : perRun * item.runs)} |`;
  });
  const priceLine = price
    ? `prices $${price.inputPerMillion}/M input, $${price.outputPerMillion}/M output (${price.source})`
    : `no price known for ${options.model}: set EVAL_PRICE_INPUT_PER_M and EVAL_PRICE_OUTPUT_PER_M`;
  const summary = [
    "# Live evaluation set: DRY RUN (nothing sent, no model called)",
    "",
    `Would send to: ${options.provider} · model ${options.model} · ${options.repeat} run(s) per anchor / sample`,
    `Evaluations: ${totals.evaluations} · estimated tokens in/out: ~${totals.inputTokens} / ~${totals.outputTokens}`,
    `Estimated cost: ${formatUsd(totals.costUsd)} (up to ${formatUsd(totals.worstCaseUsd)} if every draft is regenerated once) · ${priceLine}`,
    `Token basis: ~${calibration.tokensPerChar.toFixed(3)} input tokens per prompt character, ~${calibration.outputTokens} output tokens per evaluation (thinking included), from ${calibration.basis}`,
    "",
    "| Id | Group | Task | Runs | Words | Prompt chars | Input tokens / run | Est. cost |",
    "|---|---|---|---|---|---|---|---|",
    ...rows,
  ].join("\n");

  // Every distinct system prompt once (one per task), then each item's user message: exactly what would be sent.
  const systems = new Map<string, string>();
  const users = plan.map((item) => {
    const { system, user } = buildMultilevelEvaluationPrompt(item.input);
    if (!systems.has(item.input.task.id)) systems.set(item.input.task.id, system);
    return `### ${item.id} (${item.group}, ${item.input.task.id}, ×${item.runs})\n\n\`\`\`\n${user}\n\`\`\``;
  });
  const full = [
    summary,
    "",
    "## System prompts (one per task)",
    "",
    ...[...systems].map(([task, system]) => `### ${task}\n\n\`\`\`\n${system}\n\`\`\``),
    "",
    "## User messages",
    "",
    ...users,
  ].join("\n");
  return { summary, full, totals };
}
