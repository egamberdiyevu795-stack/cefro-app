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

  it("counts repeated content words so the evaluator can quote real numbers (live miscount: 'good'/'bad' were 7 and 6, not 'seven' in total)", () => {
    const text =
      "I think technology is very good for young people. It is good because we can talk with friends. It is nice to send photos and it is nice to watch videos. " +
      "Social media is good and bad. The good thing is that we can talk with friends every day. The bad thing is that it is bad for our eyes and it is bad for our sleep. " +
      "My friends use phones a lot and it is not good. Schools should limit phones because it is bad for studying. But phones are also good for studying sometimes. So it is good and bad.";
    const { repeatedWords } = computeSpeechMetrics(text, 95_000, 120);
    expect(repeatedWords).toEqual(expect.arrayContaining([{ word: "good", count: 7 }, { word: "bad", count: 6 }]));
    // Function words are not reported.
    expect(repeatedWords?.map((w) => w.word)).not.toContain("is");
    expect(repeatedWords?.map((w) => w.word)).not.toContain("the");
  });

  it("reports no repeated words in short or varied speech", () => {
    expect(computeSpeechMetrics("Phones help students study and talk.", 10_000, 120).repeatedWords).toEqual([]);
  });
});
