import { describe, expect, it } from "vitest";
import { computeSpeechMetrics } from "@/domain/speaking/metrics";
import { makeModelOutput, makeMultilevelResult, FIXTURE_TRANSCRIPT } from "./fixtures";
import { endpointOverrides, evidenceViolations, numericClaimMismatches, wordErrorRate } from "./live/checks";

describe("live pipeline checks (pure helpers)", () => {
  it("accepts a clean evaluation", () => {
    expect(evidenceViolations(makeMultilevelResult(), FIXTURE_TRANSCRIPT)).toEqual([]);
  });

  it("flags quotes that are not in the transcript, and a pronunciation claim", () => {
    const output = makeModelOutput();
    output.strengths[0].quote = "words that were never said";
    output.features.grammar.evidence = ["I have went to Samarkand", "invented quote here"];
    output.features.grammar.note = "Your pronunciation of 'went' is unclear.";
    const found = evidenceViolations(makeMultilevelResult(output), FIXTURE_TRANSCRIPT);
    expect(found.some((f) => f.startsWith("strengths[0] quote not in transcript"))).toBe(true);
    expect(found.some((f) => f.includes('features.grammar quote not in transcript: "invented quote here"'))).toBe(true);
    expect(found.some((f) => f.startsWith("pronunciation claim in features.grammar.note"))).toBe(true);
  });

  const metrics = computeSpeechMetrics(FIXTURE_TRANSCRIPT, 60_000, 120);

  it("accepts numbers that match the stored metrics and ignores practice targets and quoted text", () => {
    const output = makeModelOutput();
    output.features.fluency.note = `You spoke ${metrics.wordCount} words in 60 seconds. Try to speak for at least 90 seconds next time.`;
    expect(numericClaimMismatches(makeMultilevelResult(output), metrics, 60)).toEqual([]);
  });

  it("reports numeric claims that contradict the metrics", () => {
    const output = makeModelOutput();
    output.features.fluency.note = "You spoke 250 words in 30 seconds, about 500 words per minute.";
    const found = numericClaimMismatches(makeMultilevelResult(output), metrics, 60);
    expect(found.length).toBeGreaterThanOrEqual(2);
    expect(found.join("\n")).toMatch(/250 words/);
  });

  it("detects a run that is not pointed at the real endpoints", () => {
    expect(endpointOverrides({ OPENAI_BASE_URL: "http://127.0.0.1:4460", GOOGLE_GEMINI_BASE_URL: "http://127.0.0.1:4455" } as never)).toEqual(["OPENAI_BASE_URL", "GOOGLE_GEMINI_BASE_URL"]);
    expect(endpointOverrides({ OPENAI_BASE_URL: "https://api.openai.com/v1" } as never)).toEqual([]);
    expect(endpointOverrides({} as never)).toEqual([]);
  });

  it("computes word error rate against the spoken text", () => {
    expect(wordErrorRate("he go to school every day", "he go to school every day")).toBe(0);
    expect(wordErrorRate("he go to school every day", "he goes to school every day")).toBeCloseTo(1 / 6);
    expect(wordErrorRate("he go to school", "")).toBe(1);
    expect(wordErrorRate("", "anything")).toBe(0);
  });
});
