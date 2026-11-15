import { describe, expect, it } from "vitest";
import { countFeedback, feedbackSummary } from "../scripts/lib/feedback-summary.mjs";

/** The owner's "Was this feedback helpful?" counts (npm run stats:feedback). */
describe("feedback summary", () => {
  const rows = [
    { part: 2, helpful: 1, provider: "gemini" },
    { part: 2, helpful: 0, provider: "gemini" },
    { part: 2, helpful: null, provider: "gemini" },
    { part: 1, helpful: 1, provider: "gemini" },
    { part: 3, helpful: 1, provider: "mock" },
  ];

  it("counts No (0) as an answer, not as unanswered", () => {
    expect(countFeedback(rows)).toEqual({ yes: 3, no: 1, open: 1 });
    expect(countFeedback([{ helpful: false }, { helpful: true }])).toEqual({ yes: 1, no: 1, open: 0 });
  });

  it("prints all, then each part in order, then each scorer with the test scorer marked", () => {
    const lines: string[] = feedbackSummary(rows);
    expect(lines[0]).toMatch(/All scored attempts\s+scored=5\s+yes=3\s+no=1\s+not answered=1\s+75% Yes/);
    expect(lines.slice(1, 4).map((l) => l.trim().split(/\s{2,}/)[0])).toEqual(["Part 1", "Part 2", "Part 3"]);
    expect(lines.find((l) => l.includes("Part 2"))).toMatch(/scored=3\s+yes=1\s+no=1\s+not answered=1\s+50% Yes/);
    expect(lines.some((l) => l.includes("Scorer mock (test)"))).toBe(true);
    expect(feedbackSummary([])[0]).toContain("—");
  });
});
