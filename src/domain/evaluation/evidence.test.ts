import { describe, expect, it } from "vitest";
import { isQuoteInTranscript } from "./evidence";

const transcript =
  "Um, I think phones are, uh, very useful. Last year I have went to Samarkand with my friend and we used maps. He go to school every day by bus because it's far.";

describe("isQuoteInTranscript", () => {
  it("matches exact quotes regardless of case and punctuation", () => {
    expect(isQuoteInTranscript("I have went to Samarkand", transcript)).toBe(true);
    expect(isQuoteInTranscript("he go to school every day.", transcript)).toBe(true);
    expect(isQuoteInTranscript("“He go to school every day”", transcript)).toBe(true);
  });

  it("ignores fillers the evaluator dropped and curly apostrophes", () => {
    expect(isQuoteInTranscript("I think phones are very useful", transcript)).toBe(true);
    expect(isQuoteInTranscript("because it’s far", transcript)).toBe(true);
  });

  it("supports ellipses as long as segments are in order", () => {
    expect(isQuoteInTranscript("I think phones ... Samarkand with my friend", transcript)).toBe(true);
    expect(isQuoteInTranscript("Samarkand with my friend ... I think phones", transcript)).toBe(false);
  });

  it("rejects hallucinated or corrected quotes", () => {
    expect(isQuoteInTranscript("I have gone to Samarkand", transcript)).toBe(false);
    expect(isQuoteInTranscript("He goes to school every day", transcript)).toBe(false);
    expect(isQuoteInTranscript("Social media is a double-edged sword", transcript)).toBe(false);
    expect(isQuoteInTranscript("", transcript)).toBe(false);
    expect(isQuoteInTranscript("...", transcript)).toBe(false);
  });

  it("tolerates one differing word only in long quotes", () => {
    // 10 words, one copied slightly differently.
    expect(isQuoteInTranscript("Last year I have went to Samarkand with a friend and", transcript)).toBe(true);
    // Short quotes must be exact.
    expect(isQuoteInTranscript("I have go to", transcript)).toBe(false);
  });
});
