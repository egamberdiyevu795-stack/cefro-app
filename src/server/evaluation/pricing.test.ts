import { describe, expect, it } from "vitest";
import { costUsd, formatUsd, priceFor } from "./pricing";

describe("evaluation pricing helper", () => {
  it("prices input and output (thinking included) per million tokens", () => {
    const price = priceFor("gemini-3.8-flash", {})!;
    expect(price).toMatchObject({ inputPerMillion: 0.75, outputPerMillion: 3.75 });
    expect(price.source).toMatch(/unverified/);
    // 10,000 in × $0.75/M + 8,000 out × $3.75/M = $0.0075 + $0.03
    expect(costUsd({ inputTokens: 10_000, outputTokens: 8_000 }, price)).toBeCloseTo(0.0375, 10);
    expect(formatUsd(0.0375)).toBe("$0.0375");
  });

  it("matches versioned model ids and takes environment overrides", () => {
    expect(priceFor("gemini-3.8-flash-001", {})?.inputPerMillion).toBe(0.75);
    expect(priceFor("gemini-3.8-flash", { EVAL_PRICE_INPUT_PER_M: "1.5", EVAL_PRICE_OUTPUT_PER_M: "7.5" })).toMatchObject({
      inputPerMillion: 1.5,
      outputPerMillion: 7.5,
    });
  });

  it("never guesses: an unknown model or missing token counts give no cost", () => {
    expect(priceFor("some-other-model", {})).toBeNull();
    expect(costUsd({ inputTokens: 100, outputTokens: 100 }, null)).toBeNull();
    expect(costUsd({ inputTokens: null, outputTokens: 100 }, priceFor("gemini-3.8-flash", {}))).toBeNull();
    expect(formatUsd(null)).toBe("n/a");
  });
});
