import { describe, expect, it } from "vitest";
import { agreementSummary, mockAgreementSummary, recordingFormats, scoringHealth, teacherBandOf } from "../scripts/lib/scoring-summary.mjs";

/** The owner's scoring report (npm run stats:scoring, workflow "Scoring report"). */
describe("scoring health", () => {
  const rows = [
    { part: 2, status: "completed", failureStage: null, failureCode: null, provider: "gemini" },
    { part: 2, status: "completed", failureStage: null, failureCode: null, provider: null },
    { part: 2, status: "failed", failureStage: "evaluation", failureCode: "provider_quota", provider: null },
    { part: 1, status: "failed", failureStage: "evaluation", failureCode: "provider_quota", provider: null },
    { part: 3, status: "evaluating", failureStage: null, failureCode: null, provider: null },
    { part: 3, status: "completed", failureStage: null, failureCode: null, provider: "mock" },
  ];

  it("splits real scores, missing AI scores, failures and running attempts, overall then per part", () => {
    const lines: string[] = scoringHealth(rows);
    expect(lines[0]).toMatch(/All parts\s+attempts=6\s+scored\(real\)=1\s+no-AI-score=1\s+failed=2\s+running=1\s+mock=1/);
    expect(lines.slice(1, 4).map((l) => l.trim().split(/\s{2,}/)[0])).toEqual(["Part 1", "Part 2", "Part 3"]);
    expect(lines).toContain("    2    evaluation: provider_quota");
    expect(lines).toContain("  Scored by: gemini=1, mock=1");
  });

  it("groups by recording format, so a failure that only hits one browser stands out", () => {
    const lines: string[] = recordingFormats([
      { status: "completed", mimeType: "audio/webm;codecs=opus", durationMs: 120_000 },
      { status: "failed", failureCode: "audio_unsupported", mimeType: "audio/mp4", durationMs: 118_000 },
      { status: "failed", failureCode: "audio_unsupported", mimeType: "audio/mp4", durationMs: 4_000 },
      { status: "failed", failureCode: "upload_failed", mimeType: null, durationMs: null },
    ]);
    expect(lines[0]).toMatch(/audio\/mp4\s+attempts=2\s+completed=0\s+failed=2 \(1x audio_unsupported >=60s, 1x audio_unsupported <10s\)/);
    expect(lines).toContainEqual(expect.stringMatching(/audio\/webm\s+attempts=1\s+completed=1\s+failed=0$/));
    expect(lines).toContainEqual(expect.stringMatching(/no recording\s+attempts=1\s+completed=0\s+failed=1 \(1x upload_failed \?\)/));
  });

  it("prints a zero line on an empty database", () => {
    expect(scoringHealth([])).toHaveLength(1);
  });
});

describe("teacher agreement", () => {
  it("uses the app's band when the teacher agreed", () => {
    expect(teacherBandOf({ agrees: 1, appBand: 3, teacherBand: null })).toBe(3);
    expect(teacherBandOf({ agrees: 0, appBand: 3, teacherBand: 2 })).toBe(2);
  });

  it("counts exact, within one band, and which way the app is off", () => {
    const rows = [
      { part: 2, appBand: 3, agrees: 1, teacherBand: null },
      { part: 2, appBand: 4, agrees: 0, teacherBand: 3 },
      { part: 2, appBand: 5, agrees: 0, teacherBand: 2 },
      { part: "3", appBand: 2, agrees: 0, teacherBand: 3 },
    ];
    const lines: string[] = agreementSummary(rows);
    expect(lines[0]).toMatch(/rated=4\s+exact=1 \(25%\)\s+within-1=3 \(75%\)\s+app-higher=2\s+app-lower=1\s+mean\(app-teacher\)=0\.75/);
    expect(lines.find((l) => l.includes("Part 2"))).toMatch(/rated=3\s+exact=1 \(33%\)\s+within-1=2 \(67%\)/);
    expect(agreementSummary([])[0]).toMatch(/rated=0\s+exact=0 \(—\)/);
  });

  it("compares whole-mock levels and counts mocks rated before the estimate was ready", () => {
    const lines: string[] = mockAgreementSummary([
      { appLevel: "B2", agrees: 1, teacherLevel: null },
      { appLevel: "B2", agrees: 0, teacherLevel: "B1" },
      { appLevel: null, agrees: 0, teacherLevel: "B1" },
    ]);
    expect(lines[0]).toMatch(/rated=2\s+same level=1 \(50%\)\s+app-higher=1\s+app-lower=0\s+rated before the estimate was ready=1/);
  });
});
