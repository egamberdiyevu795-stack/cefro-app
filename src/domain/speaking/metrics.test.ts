import { describe, expect, it } from "vitest";
import { computeSpeechMetrics, tokenizeWords } from "./metrics";

describe("computeSpeechMetrics", () => {
  it("counts words, fillers and rate", () => {
    const m = computeSpeechMetrics("Um, I think phones are useful. Uh, I think they help.", 30_000, 120);
    expect(m.fillerCount).toBe(2);
    expect(m.wordCount).toBe(tokenizeWords("I think phones are useful I think they help").length);
    expect(m.speakingSeconds).toBe(30);
    expect(m.wordsPerMinute).toBe(18);
    expect(m.timeUsedRatio).toBe(0.25);
  });

  it("finds phrases repeated three or more times", () => {
    const text = "I think it is good. I think it is bad. I think it is fine. Really.";
    const m = computeSpeechMetrics(text, 20_000, 120);
    expect(m.repeatedPhrases[0]).toEqual({ phrase: "i think it", count: 3 });
    // "i think" is covered by the longer phrase with the same count.
    expect(m.repeatedPhrases.some((p) => p.phrase === "i think")).toBe(false);
  });

  it("handles empty transcripts without dividing by zero", () => {
    const m = computeSpeechMetrics("", 0, 120);
    expect(m).toMatchObject({ wordCount: 0, wordsPerMinute: null, lexicalVariety: null, timeUsedRatio: 0 });
  });
});
