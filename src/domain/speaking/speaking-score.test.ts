import { describe, expect, it } from "vitest";
import { levelOfSpeaking75, rawToSpeaking75 } from "./speaking-score";
import { SPEAKING_SCORE_TABLE, SPEAKING_SCORE_TABLE_SOURCE } from "./speaking-score-table";

/** The official table, typed again here on purpose: the data file and this list must agree. */
const OFFICIAL: ReadonlyArray<readonly [number, number]> = [
  [21, 75], [20.5, 73], [20, 71], [19.5, 69], [19, 67], [18.5, 65], [18, 64], [17.5, 63], [17, 61], [16.5, 59], [16, 57],
  [15.5, 56], [15, 54], [14.5, 52], [14, 51], [13.5, 50], [13, 49], [12.5, 47], [12, 46], [11.5, 45], [11, 43],
  [10.5, 42], [10, 40], [9.5, 39], [9, 38], [8.5, 37], [8, 35], [7.5, 33], [7, 32], [6.5, 30], [6, 29], [5.5, 27],
  [5, 26], [4.5, 24], [4, 23], [3.5, 21], [3, 19], [2.5, 17], [2, 15], [1.5, 13], [1, 11], [0.5, 10], [0, 0],
];

describe("rawToSpeaking75 (official UZBMB rating scale)", () => {
  it("has all 43 rows, from 0 to 21 in half steps", () => {
    expect(OFFICIAL).toHaveLength(43);
    expect(SPEAKING_SCORE_TABLE).toHaveLength(43);
    expect(SPEAKING_SCORE_TABLE.map(([raw]) => raw)).toEqual(Array.from({ length: 43 }, (_, i) => i / 2));
  });

  it.each(OFFICIAL)("raw %s -> %s", (raw, score) => {
    expect(rawToSpeaking75(raw)).toBe(score);
  });

  it("never goes down as the raw total goes up", () => {
    for (let i = 1; i < SPEAKING_SCORE_TABLE.length; i++) {
      expect(SPEAKING_SCORE_TABLE[i][1]).toBeGreaterThan(SPEAKING_SCORE_TABLE[i - 1][1]);
    }
  });

  it.each([-0.5, 21.5, 7.25, -1, 22, 0.1, Number.NaN, Number.POSITIVE_INFINITY])("rejects %s", (raw) => {
    expect(rawToSpeaking75(raw)).toBeNull();
  });

  it("names its source", () => {
    expect(SPEAKING_SCORE_TABLE_SOURCE.url).toBe("https://uzbmb.uz/upload/file/pdf/phone/reyting_shkala.pdf");
    expect(SPEAKING_SCORE_TABLE_SOURCE.checked).toBe("2026-11-13");
  });
});

describe("levelOfSpeaking75 (official bands)", () => {
  it("sits on every boundary", () => {
    expect(levelOfSpeaking75(75)).toBe("C1");
    expect(levelOfSpeaking75(65)).toBe("C1");
    expect(levelOfSpeaking75(64)).toBe("B2");
    expect(levelOfSpeaking75(51)).toBe("B2");
    expect(levelOfSpeaking75(50)).toBe("B1");
    expect(levelOfSpeaking75(38)).toBe("B1");
    expect(levelOfSpeaking75(37)).toBe("Below B1");
    expect(levelOfSpeaking75(0)).toBe("Below B1");
  });
});
