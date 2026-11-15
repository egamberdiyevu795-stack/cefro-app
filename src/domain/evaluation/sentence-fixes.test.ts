import { describe, expect, it } from "vitest";
import { betterParts, checkSentenceFixes, diffTokens, MAX_SENTENCE_FIXES, type SentenceFix, type SentenceFixDropReason } from "./sentence-fixes";

/** The transcript of the example in docs/v1-plan.md §3.3 and of feedback-review issue 1 (A0 r1), plus two more sentences. */
const TRANSCRIPT =
  "My father give me advice. I am 16 year. I want stop school because um it is boring. We was in the same class, and my friend say he don't like it. People is different.";

const fix = (you_said: string, better: string, why = "Use the past tense."): SentenceFix => ({ you_said, better, why });
const check = (items: SentenceFix[], transcript = TRANSCRIPT, transcriptOnly = true) => checkSentenceFixes(items, { transcript, transcriptOnly });
const reasons = (items: SentenceFix[], transcript = TRANSCRIPT) => check(items, transcript).dropped.map((d) => d.reason);
const only = (item: SentenceFix): SentenceFixDropReason | "kept" => reasons([item])[0] ?? "kept";

describe("checkSentenceFixes: keeps a good item", () => {
  it("the plan's example: one word fixed, the student's words and idea kept", () => {
    const { kept, dropped } = check([fix("My father give me advice", "My father gave me advice", "Past story: use the past tense.")]);
    expect(dropped).toEqual([]);
    expect(kept).toEqual([{ you_said: "My father give me advice", better: "My father gave me advice", why: "Past story: use the past tense." }]);
  });

  it.each([
    ["a word added", "I am 16 year", "I am 16 years old"],
    ["a missing 'to'", "I want stop school", "I want to stop school"],
    ["a wrong form after don't", "he don't like it", "he doesn't like it"],
    ["a plural verb", "People is different", "People are different"],
    ["be in the past", "We was in the same class", "We were in the same class"],
  ])("%s", (_name, said, better) => {
    expect(only(fix(said, better))).toBe("kept");
  });

  it("ignores case, punctuation and written hesitation sounds when looking for the words", () => {
    expect(only(fix("because it is boring", "because it is boring today", "Why."))).not.toBe("not_in_transcript");
    expect(only(fix("I want stop school because it is boring", "I want to stop school because it is boring"))).toBe("kept");
  });

  it("trims and collapses spaces in what it keeps", () => {
    const { kept } = check([fix("  My father  give me advice ", " My father gave me advice  ", " Use the past. ")]);
    expect(kept[0]).toEqual({ you_said: "My father give me advice", better: "My father gave me advice", why: "Use the past." });
  });

  it("allows a word moved to another place (two changes of the same words, one mistake)", () => {
    expect(only(fix("my friend say he don't like it", "my friend say he like it don't"))).not.toBe("several_mistakes");
    const t = "I very like football and I play it every day.";
    expect(checkSentenceFixes([fix("I very like football", "I like very football")], { transcript: t, transcriptOnly: true }).dropped).toEqual([]);
  });
});

describe("checkSentenceFixes: you_said must be found word for word", () => {
  it("drops a sentence the student did not say", () => {
    expect(only(fix("My father gave me some advice", "My father gave me advice"))).toBe("not_in_transcript");
  });
  it("drops a 'you_said' that is already corrected or paraphrased", () => {
    expect(only(fix("My father gave me advice", "My father gave me good advice"))).toBe("not_in_transcript");
    expect(only(fix("my dad give advice", "my dad gives advice"))).toBe("not_in_transcript");
  });
  it("drops a quote with an ellipsis (words were skipped) and a single word", () => {
    expect(only(fix("My father … advice", "My father gave advice"))).toBe("not_in_transcript");
    expect(only(fix("give", "gave"))).toBe("not_in_transcript");
  });
  it("drops a quote that joins words from two places", () => {
    expect(only(fix("My father advice", "My father gave advice"))).toBe("not_in_transcript");
  });
  it("drops a quote longer than 25 words", () => {
    const long = Array.from({ length: 30 }, (_, i) => `word${i}`).join(" ");
    expect(reasons([fix(long, `${long} more`)], long)).toEqual(["too_long"]);
  });
});

describe("checkSentenceFixes: better changes only the mistake", () => {
  it("drops a better that is the same words (nothing fixed, or only a hesitation sound removed)", () => {
    expect(only(fix("My father give me advice", "my father give me advice."))).toBe("unchanged");
    expect(only(fix("because um it is boring", "because it is boring"))).toBe("unchanged");
  });
  it("drops a better that adds a new idea: more than a few words longer", () => {
    expect(only(fix("My father give me advice", "My father gave me advice about my exams and my future"))).toBe("changes_too_much");
    expect(only(fix("I am 16 year", "I am 16 years old and I live in Tashkent with my family"))).toBe("changes_too_much");
  });
  it("drops a better that adds new words of its own, even when it is short", () => {
    expect(only(fix("I am 16 year", "I am 16 years old, quite clever"))).toBe("adds_idea");
  });
  it("drops a better that rewrites the sentence (a model answer, not a fix)", () => {
    expect(only(fix("My father give me advice", "Dad advised me wisely"))).toBe("changes_too_much");
    expect(only(fix("I want stop school because um it is boring", "I plan to quit education since lessons bore me"))).toBe("changes_too_much");
  });
  it("drops a better that cuts away the student's idea", () => {
    expect(only(fix("my friend say he don't like it", "he doesn't"))).toBe("changes_too_much");
  });
  it("drops an item with more than one mistake fixed in it", () => {
    expect(only(fix("My father give me advice. I am 16 year", "My father gave me advice. I am 16 years old"))).toBe("several_mistakes");
    expect(only(fix("We was in the same class, and my friend say", "We were in the same class, and my friend says"))).toBe("several_mistakes");
  });
  it("one change that touches two neighbouring words is still one mistake", () => {
    expect(only(fix("he don't like it", "he doesn't like it"))).toBe("kept");
    expect(only(fix("my friend say he don't like it", "my friend says he doesn't like it"))).toBe("several_mistakes");
  });
});

describe("checkSentenceFixes: a transcript cannot show pauses or pronunciation (feedback-review issue 2)", () => {
  const cases = [
    "You paused too long before this sentence.",
    "Speak more slowly here.",
    "Avoid filler words like um.",
    "Your pronunciation of 'advice' was unclear.",
    "Try to sound more natural.",
    "Stress the second syllable.",
    "The speed of this sentence was too fast.",
    "Breathe before you start.",
    "You hesitated at the start.",
    "Smoother delivery needed.",
  ];
  it.each(cases)("drops: %s", (why) => {
    expect(only(fix("My father give me advice", "My father gave me advice", why))).toBe("pause_or_pronunciation");
  });
  it("only on a transcript-only run; the student's own words in 'better' are never judged", () => {
    const item = fix("My father give me advice", "My father gave me advice", "Pronunciation: say it clearly.");
    expect(checkSentenceFixes([item], { transcript: TRANSCRIPT, transcriptOnly: false }).dropped).toEqual([]);
    expect(checkSentenceFixes([item], { transcript: TRANSCRIPT, transcriptOnly: true }).dropped).toHaveLength(1);
    const slow = "he drive slow in the city";
    expect(checkSentenceFixes([fix("he drive slow", "he drives slow", "Add -s after he.")], { transcript: slow, transcriptOnly: true }).dropped).toEqual([]);
  });
  it("a grammar reason about 'because' or 'tense' is not about pauses", () => {
    expect(only(fix("My father give me advice", "My father gave me advice", "A story about the past takes the past tense."))).toBe("kept");
  });
});

describe("checkSentenceFixes: why is one short line", () => {
  it("drops a why with two sentences or two rules, or more than 20 words", () => {
    expect(only(fix("My father give me advice", "My father gave me advice", "Use the past tense. Also check the word order."))).toBe("why_too_long");
    expect(only(fix("My father give me advice", "My father gave me advice", "Use the past tense; also add an article."))).toBe("why_too_long");
    expect(only(fix("My father give me advice", "My father gave me advice", Array.from({ length: 21 }, () => "word").join(" ")))).toBe("why_too_long");
  });
  it("drops empty fields", () => {
    expect(only(fix("My father give me advice", "My father gave me advice", "  "))).toBe("incomplete");
  });
  it("drops text that must not reach a student (internal field names)", () => {
    const item = fix("My father give me advice", "My father gave me advice", "See how_to_improve for the rule.");
    const result = checkSentenceFixes([item], { transcript: TRANSCRIPT, transcriptOnly: true, forbidden: /\bhow_to_improve\b/ });
    expect(result.dropped).toEqual([{ index: 0, reason: "forbidden_text" }]);
  });
});

describe("checkSentenceFixes: the list", () => {
  it("keeps the model's order (most important first) and says which items it dropped", () => {
    const { kept, dropped } = check([
      fix("I am 16 year", "I am 16 years old"),
      fix("not in the text at all", "not in the text"),
      fix("My father give me advice", "My father gave me advice"),
    ]);
    expect(kept.map((k) => k.you_said)).toEqual(["I am 16 year", "My father give me advice"]);
    expect(dropped).toEqual([{ index: 1, reason: "not_in_transcript" }]);
  });
  it("drops an item that overlaps one already kept (same words twice, or one inside the other)", () => {
    expect(
      reasons([fix("I want stop school", "I want to stop school"), fix("want stop", "want to stop"), fix("I want stop school", "I want to stop school")]),
    ).toEqual(["overlaps", "overlaps"]);
  });
  it("keeps at most 8", () => {
    const words = Array.from({ length: 12 }, (_, i) => `he don't like${"x".repeat(i)}`);
    const transcript = words.map((w) => `${w}.`).join(" ");
    const items = words.map((w) => fix(w, w.replace("don't", "doesn't")));
    const { kept, dropped } = checkSentenceFixes(items, { transcript, transcriptOnly: true });
    expect(kept).toHaveLength(MAX_SENTENCE_FIXES);
    expect(dropped.every((d) => d.reason === "over_limit")).toBe(true);
    expect(kept.map((k) => k.you_said)).toEqual(words.slice(0, MAX_SENTENCE_FIXES));
  });
  it("an empty list stays empty", () => {
    expect(check([])).toEqual({ kept: [], dropped: [] });
  });
});

describe("diffTokens and betterParts", () => {
  it("counts separate changes, and joins neighbouring ones", () => {
    expect(diffTokens(["a", "b", "c"], ["a", "b", "c"]).hunks).toBe(0);
    expect(diffTokens(["a", "b", "c"], ["a", "x", "c"]).hunks).toBe(1);
    expect(diffTokens(["a", "b", "c", "d"], ["a", "x", "y", "d"]).hunks).toBe(1);
    expect(diffTokens(["a", "b", "c", "d", "e"], ["a", "x", "c", "y", "e"]).hunks).toBe(2);
    expect(diffTokens(["a", "b"], ["a", "b", "c"]).hunks).toBe(1);
  });
  it("marks only the changed words of 'better'", () => {
    expect(betterParts("My father give me advice", "My father gave me advice.")).toEqual([
      { text: "My father ", changed: false },
      { text: "gave", changed: true },
      { text: " me advice.", changed: false },
    ]);
    expect(betterParts("I am 16 year", "I am 16 years old")).toEqual([
      { text: "I am 16 ", changed: false },
      { text: "years old", changed: true },
    ]);
  });
  it("marks nothing when only words were removed", () => {
    expect(betterParts("more better", "better").every((p) => !p.changed)).toBe(true);
  });
});
