import { describe, expect, it } from "vitest";
import { estimateMockSpeaking } from "./mock-score";
import type { PartBands } from "./mock-level";

const bands = (p11: number | null, p12: number | null, p2: number | null, p3: number | null): PartBands => ({ "1.1": p11, "1.2": p12, "2": p2, "3": p3 });
const scored = (level: string, score: number) => ({ kind: "ready", level, score });

describe("estimateMockSpeaking", () => {
  it("sums the four marks, converts with the official table and levels by the official bands", () => {
    expect(estimateMockSpeaking(bands(5, 5, 5, 6))).toEqual(scored("C1", 75)); // raw 21
    expect(estimateMockSpeaking(bands(5, 5, 5, 4))).toEqual(scored("C1", 67)); // raw 19
    expect(estimateMockSpeaking(bands(5, 5, 4, 4))).toEqual(scored("B2", 64)); // raw 18: top of B2
    expect(estimateMockSpeaking(bands(4, 3, 3, 4))).toEqual(scored("B2", 51)); // raw 14: bottom of B2
    expect(estimateMockSpeaking(bands(4, 3, 3, 3))).toEqual(scored("B1", 49)); // raw 13
    expect(estimateMockSpeaking(bands(3, 3, 2, 2))).toEqual(scored("B1", 40)); // raw 10
    expect(estimateMockSpeaking(bands(2, 2, 2, 2))).toEqual(scored("Below B1", 35)); // raw 8: 35 is under 38
    expect(estimateMockSpeaking(bands(2, 2, 1, 2))).toEqual(scored("Below B1", 32)); // raw 7
    expect(estimateMockSpeaking(bands(0, 0, 0, 0))).toEqual(scored("Below B1", 0));
  });

  it("reads Part 1.1 once the score is computed (it is one of the four marks)", () => {
    expect(estimateMockSpeaking(bands(0, 3, 3, 4))).toEqual(scored("B1", 40)); // raw 10
    expect(estimateMockSpeaking(bands(5, 3, 3, 4))).toEqual(scored("B2", 54)); // raw 15
  });

  it("falls back to the interim rule, with NO score, when Part 1.1 has no band", () => {
    expect(estimateMockSpeaking(bands(null, 4, 3, 4))).toEqual({ kind: "ready", level: "B2", score: null });
  });

  it("falls back, with no score, when the sum is not a valid raw total", () => {
    expect(estimateMockSpeaking(bands(6, 6, 6, 6))).toMatchObject({ kind: "ready", score: null });
  });

  it("gives no level when a part the interim rule needs has no band", () => {
    expect(estimateMockSpeaking(bands(4, 4, 4, null))).toEqual({ kind: "not_ready", missing: ["3"] });
    expect(estimateMockSpeaking({})).toMatchObject({ kind: "not_ready" });
  });
});
