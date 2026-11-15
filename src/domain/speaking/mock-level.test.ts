import { describe, expect, it } from "vitest";
import { ESTIMATE_NOT_READY, RULE_PARTS, SPEAKING_ONLY_LINE, estimateSpeakingLevel, type PartBands } from "./mock-level";

const ready = (level: string) => ({ kind: "ready", level });
const bands = (p12: number | null, p2: number | null, p3: number | null, p11: number | null = 4): PartBands => ({ "1.1": p11, "1.2": p12, "2": p2, "3": p3 });

describe("estimateSpeakingLevel (docs/official-scale.md, section 5)", () => {
  it("C1 needs Part 3 band 5+ and Part 2 band 3+", () => {
    expect(estimateSpeakingLevel(bands(4, 3, 5))).toEqual(ready("C1"));
    expect(estimateSpeakingLevel(bands(5, 5, 6))).toEqual(ready("C1"));
  });

  it("B2: Part 2 band 3+, or Part 3 band 3 or 4", () => {
    expect(estimateSpeakingLevel(bands(3, 3, 0))).toEqual(ready("B2"));
    expect(estimateSpeakingLevel(bands(0, 4, 4))).toEqual(ready("B2"));
    expect(estimateSpeakingLevel(bands(0, 0, 3))).toEqual(ready("B2"));
    expect(estimateSpeakingLevel(bands(0, 0, 4))).toEqual(ready("B2"));
    // Part 3 at C1 but Part 2 below B2: not C1, and not lower than a Part 3 band 4 either.
    expect(estimateSpeakingLevel(bands(4, 2, 5))).toEqual(ready("B2"));
    expect(estimateSpeakingLevel(bands(4, 2, 6))).toEqual(ready("B2"));
  });

  it("B1: Part 2 band 1 or 2, or Part 1.2 band 3+", () => {
    expect(estimateSpeakingLevel(bands(0, 1, 0))).toEqual(ready("B1"));
    expect(estimateSpeakingLevel(bands(0, 2, 2))).toEqual(ready("B1"));
    expect(estimateSpeakingLevel(bands(3, 0, 0))).toEqual(ready("B1"));
    expect(estimateSpeakingLevel(bands(5, 0, 1))).toEqual(ready("B1"));
  });

  it("Below B1 when nothing above holds, and band 0 is a band, not a missing one", () => {
    expect(estimateSpeakingLevel(bands(0, 0, 0))).toEqual(ready("Below B1"));
    expect(estimateSpeakingLevel(bands(2, 0, 2))).toEqual(ready("Below B1"));
  });

  it("sits exactly on every boundary", () => {
    expect(estimateSpeakingLevel(bands(0, 2, 0))).toEqual(ready("B1"));
    expect(estimateSpeakingLevel(bands(0, 3, 0))).toEqual(ready("B2"));
    expect(estimateSpeakingLevel(bands(0, 3, 4))).toEqual(ready("B2"));
    expect(estimateSpeakingLevel(bands(0, 3, 5))).toEqual(ready("C1"));
    expect(estimateSpeakingLevel(bands(2, 0, 0))).toEqual(ready("Below B1"));
    expect(estimateSpeakingLevel(bands(3, 0, 0))).toEqual(ready("B1"));
    expect(estimateSpeakingLevel(bands(0, 0, 2))).toEqual(ready("Below B1"));
  });

  it("never reads Part 1.1", () => {
    for (const p11 of [0, 3, 5, null]) {
      expect(estimateSpeakingLevel(bands(3, 2, 2, p11))).toEqual(ready("B1"));
    }
  });

  it("gives no level, never a guess, when a part the rule needs has no band", () => {
    expect(estimateSpeakingLevel(bands(4, 4, null))).toEqual({ kind: "not_ready", missing: ["3"] });
    expect(estimateSpeakingLevel(bands(null, 4, 5))).toEqual({ kind: "not_ready", missing: ["1.2"] });
    expect(estimateSpeakingLevel(bands(null, null, null))).toEqual({ kind: "not_ready", missing: ["1.2", "2", "3"] });
    // Even when what is known already says "B2 at least": the missing part could still make it C1.
    expect(estimateSpeakingLevel({ "2": 5, "1.2": 4 })).toEqual({ kind: "not_ready", missing: ["3"] });
    expect(estimateSpeakingLevel({})).toEqual({ kind: "not_ready", missing: ["1.2", "2", "3"] });
  });

  it("is not made ready by a missing Part 1.1", () => {
    expect(estimateSpeakingLevel(bands(4, 4, 4, null))).toEqual(ready("B2"));
  });

  it("is monotonic: a higher band in any part never lowers the level", () => {
    const order = ["Below B1", "B1", "B2", "C1"];
    const level = (b: PartBands) => {
      const e = estimateSpeakingLevel(b);
      if (e.kind !== "ready") throw new Error("not ready");
      return order.indexOf(e.level);
    };
    for (let a = 0; a <= 5; a++)
      for (let b = 0; b <= 5; b++)
        for (let c = 0; c <= 6; c++) {
          const here = level(bands(a, b, c));
          if (a < 5) expect(level(bands(a + 1, b, c))).toBeGreaterThanOrEqual(here);
          if (b < 5) expect(level(bands(a, b + 1, c))).toBeGreaterThanOrEqual(here);
          if (c < 6) expect(level(bands(a, b, c + 1))).toBeGreaterThanOrEqual(here);
        }
  });

  it("only ever returns a CEFR level: no score, no pass or fail, no certificate wording", () => {
    for (let a = 0; a <= 5; a++)
      for (let b = 0; b <= 5; b++)
        for (let c = 0; c <= 6; c++) {
          const e = estimateSpeakingLevel(bands(a, b, c));
          expect(e.kind).toBe("ready");
          if (e.kind === "ready") expect(["Below B1", "B1", "B2", "C1"]).toContain(e.level);
        }
    expect(RULE_PARTS).toEqual(["1.2", "2", "3"]);
  });

  it("the wording is the official-scale doc's, word for word", () => {
    expect(SPEAKING_ONLY_LINE).toBe("Speaking only. An estimate from this mock, not an official UZBMB score.");
    expect(ESTIMATE_NOT_READY).toBe("Estimate not ready yet");
  });
});
