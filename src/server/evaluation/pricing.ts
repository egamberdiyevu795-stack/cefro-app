import "server-only";

/**
 * Price estimates for evaluation calls, used by the live evaluation report. Not used for billing.
 *
 * Prices are USD per 1M tokens. Gemini bills thinking tokens as output; GeminiEvaluationModel already adds thinking
 * tokens to `outputTokens`, so output is priced once at the output rate.
 *
 * The defaults could not be checked against Google's own pricing page from the development sandbox (the host is not
 * reachable there). They are the figures third-party trackers list for gemini-3.8-flash in November 2026: $0.75
 * input / $3.75 output, said to be an introductory rate until 31 Dec 2026 ($1.50 / $7.50 after that). Set
 * EVAL_PRICE_INPUT_PER_M and EVAL_PRICE_OUTPUT_PER_M to override them.
 */
export interface TokenPrice {
  inputPerMillion: number;
  outputPerMillion: number;
  /** Where the numbers come from, printed in the report. */
  source: string;
}

const UNVERIFIED = "unverified: third-party trackers, Nov 2026; check ai.google.dev/gemini-api/docs/pricing";

export const DEFAULT_PRICES: Record<string, TokenPrice> = {
  "gemini-3.8-flash": { inputPerMillion: 0.75, outputPerMillion: 3.75, source: `introductory rate until 31 Dec 2026, ${UNVERIFIED}` },
};

/** Price for `model`: environment override first, then the table (exact id or a "-suffixed" version of it), else null. */
export function priceFor(model: string, env: Record<string, string | undefined> = process.env): TokenPrice | null {
  const input = Number(env.EVAL_PRICE_INPUT_PER_M);
  const output = Number(env.EVAL_PRICE_OUTPUT_PER_M);
  if (env.EVAL_PRICE_INPUT_PER_M && env.EVAL_PRICE_OUTPUT_PER_M && Number.isFinite(input) && Number.isFinite(output) && input >= 0 && output >= 0) {
    return { inputPerMillion: input, outputPerMillion: output, source: "EVAL_PRICE_INPUT_PER_M / EVAL_PRICE_OUTPUT_PER_M" };
  }
  const key = Object.keys(DEFAULT_PRICES).find((id) => model === id || model.startsWith(`${id}-`));
  return key ? DEFAULT_PRICES[key] : null;
}

/** Cost in USD of one evaluation, or null when the price or a token count is unknown (never guessed). */
export function costUsd(tokens: { inputTokens: number | null; outputTokens: number | null }, price: TokenPrice | null): number | null {
  if (!price || tokens.inputTokens === null || tokens.outputTokens === null) return null;
  return (tokens.inputTokens * price.inputPerMillion + tokens.outputTokens * price.outputPerMillion) / 1_000_000;
}

/** "$0.0123"; "n/a" for an unknown cost. */
export function formatUsd(cost: number | null): string {
  return cost === null ? "n/a" : `$${cost.toFixed(4)}`;
}
