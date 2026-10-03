import { describe, expect, it } from "vitest";
import { computeSpeechMetrics } from "@/domain/speaking/metrics";
import { makeEvaluation, FIXTURE_TRANSCRIPT } from "./fixtures";
import { endpointOverrides, evidenceViolations, numericClaimMismatches, wordErrorRate } from "./live/checks";

describe("live pipeline checks (pure helpers)", () => {
  it("accepts a clean evaluation", () => {
    expect(evidenceViolations(makeEvaluation(), FIXTURE_TRANSCRIPT)).toEqual([]);
  });

  it("flags quotes that are not in the transcript, and a pronunciation claim", () => {
    const base = makeEvaluation();
    const bad = makeEvaluation({
      strengths: [{ ...base.strengths[0], evidence_quote: "words that were never said" }],
      issues: [{ ...base.issues[0], evidence_quotes: ["I have went to Samarkand", "invented quote here"], problem: "Your pronunciation of 'went' is unclear." }, base.issues[1]],
    });
    const found = evidenceViolations(bad, FIXTURE_TRANSCRIPT);
    expect(found.some((f) => f.startsWith("strengths[0] quote not in transcript"))).toBe(true);
    expect(found.some((f) => f.includes('issues[0] quote not in transcript: "invented quote here"'))).toBe(true);
    expect(found.some((f) => f.startsWith("pronunciation claim in issues[0].problem"))).toBe(true);
  });

  const metrics = computeSpeechMetrics(FIXTURE_TRANSCRIPT, 60_000, 120); // 28 words in 60 s

  it("accepts numbers that match the stored metrics and ignores practice targets and quoted text", () => {
    const evaluation = makeEvaluation({
      overall_summary: `You spoke ${metrics.wordCount} words in 60 seconds. Try to speak for at least 90 seconds next time.`,
    });
    expect(numericClaimMismatches(evaluation, metrics, 60)).toEqual([]);
  });

  it("reports numeric claims that contradict the metrics", () => {
    const evaluation = makeEvaluation({ overall_summary: "You spoke 250 words in 30 seconds, about 500 words per minute." });
    const found = numericClaimMismatches(evaluation, metrics, 60);
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
