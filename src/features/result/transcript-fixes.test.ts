import { describe, expect, it } from "vitest";
import { buildTranscriptFixes, fixCountText } from "./transcript-fixes";

const T = "My father give me advice. I am 16 year, um, and I want stop school. It was a hard year. We was tired.";
const fixes = [
  { you_said: "I want stop school", better: "I want to stop school", why: "Put 'to' before the second verb." },
  { you_said: "My father give me advice", better: "My father gave me advice", why: "Past story: use the past tense." },
  { you_said: "We was tired", better: "We were tired", why: "After we, use 'were'." },
];

describe("buildTranscriptFixes", () => {
  it("is null for a result without a list (scored before 3.6.0): the plain transcript", () => {
    expect(buildTranscriptFixes(T, undefined)).toBeNull();
  });

  it("an empty list is a view with no marked sentences", () => {
    const view = buildTranscriptFixes(T, [])!;
    expect(view.count).toBe(0);
    expect(view.items).toEqual([]);
    expect(view.units.map((u) => u.pieces.map((p) => p.text).join("")).join("")).toBe(T);
  });

  it("tiles the transcript exactly, whatever is marked", () => {
    const view = buildTranscriptFixes(T, fixes)!;
    expect(view.units.map((u) => u.pieces.map((p) => p.text).join("")).join("")).toBe(T);
  });

  it("counts sentences with a mistake, and underlines only the words quoted", () => {
    const view = buildTranscriptFixes(T, fixes)!;
    expect(view.count).toBe(3);
    const marked = view.units.flatMap((u) => u.pieces.filter((p) => p.fixId !== null).map((p) => p.text));
    expect(marked).toEqual(["My father give me advice", "I want stop school", "We was tired"]);
    // The unit "I am 16 year, um, and I want stop school." holds fix 0 and keeps its other words plain.
    const unit = view.units.find((u) => u.fixIds.includes(0))!;
    expect(unit.pieces.map((p) => p.fixId)).toEqual([null, 0, null]);
  });

  it("shows 'You said' as the transcript has it, with the changed words of 'better' marked", () => {
    const view = buildTranscriptFixes(T, fixes)!;
    expect(view.items[1].youSaid).toBe("My father give me advice");
    expect(view.items[1].better.filter((p) => p.changed).map((p) => p.text)).toEqual(["gave"]);
    expect(view.items[0].better.filter((p) => p.changed).map((p) => p.text)).toEqual(["to"]);
  });

  it("two mistakes in one sentence are one tap target with two items; the count is sentences", () => {
    const text = "My father give me advice and I am 16 year.";
    const view = buildTranscriptFixes(text, [
      { you_said: "My father give me advice", better: "My father gave me advice", why: "Use the past tense." },
      { you_said: "I am 16 year", better: "I am 16 years old", why: "Say your age with 'years old'." },
    ])!;
    expect(view.count).toBe(1);
    expect(view.units).toHaveLength(1);
    expect(view.units[0].fixIds).toEqual([0, 1]);
  });

  it("a mistake across a full stop keeps its sentences together", () => {
    const text = "I like it. It are good. Yes.";
    const view = buildTranscriptFixes(text, [{ you_said: "like it It are good", better: "like it It is good", why: "Singular 'it' takes 'is'." }])!;
    expect(view.units.map((u) => u.fixIds.length)).toEqual([1, 0]);
    expect(view.units[0].pieces.map((p) => p.text).join("")).toBe("I like it. It are good. ");
  });

  it("skips an item whose words cannot be placed (never marks the wrong words)", () => {
    const view = buildTranscriptFixes(T, [{ you_said: "words nobody said", better: "x", why: "y" }])!;
    expect(view.count).toBe(0);
    expect(view.items).toEqual([]);
  });

  it("marks the copied runs of Part 3 as well, without losing the underline", () => {
    const view = buildTranscriptFixes("Cars is bad. Cleaner air is good.", [{ you_said: "Cars is bad", better: "Cars are bad", why: "Plural takes 'are'." }], [{ start: 13, end: 24 }])!;
    expect(view.units.flatMap((u) => u.pieces).filter((p) => p.copied).map((p) => p.text).join("")).toBe("Cleaner air");
    expect(view.units[0].fixIds).toEqual([0]);
  });
});

describe("fixCountText", () => {
  it("says it plainly", () => {
    expect(fixCountText(6)).toBe("6 sentences to improve");
    expect(fixCountText(1)).toBe("1 sentence to improve");
    expect(fixCountText(0)).toBe("No sentences marked in this answer");
  });
});
