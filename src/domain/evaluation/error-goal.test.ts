import { describe, expect, it } from "vitest";
import { errorExampleGoal } from "./error-goal";

const articleError = { quote: "is very hot topic", correction: "is a very hot topic", type: "grammar", pattern: "Missing article" };
const rule = "Use 'a' before a singular noun: 'a hot topic'.";

describe("errorExampleGoal: the goal tells the same story as the mistake shown above it", () => {
  it("uses the named pattern and its rule when the shown mistake belongs to one", () => {
    const goal = errorExampleGoal({ errors: [articleError], error_patterns: [{ name: "Missing article", rule }] }, "grammar");
    expect(goal?.objective).toBe(`Stop this kind of mistake: Missing article. ${rule}`);
    expect(goal?.success_check).toBe("Your answer has no more mistakes of this kind: Missing article.");
  });

  it("without a pattern, points at the mistake shown and asks for the same check on other sentences", () => {
    const goal = errorExampleGoal({ errors: [{ ...articleError, pattern: "" }], error_patterns: [] }, "grammar");
    expect(goal?.objective).toBe("Look for the same kind of grammar mistake in your other sentences, and correct it as shown above.");
    expect(goal?.success_check).toContain("is very hot topic");
    expect(errorExampleGoal({ errors: [{ quote: "make a photo", correction: "take a photo", type: "vocabulary", pattern: "" }] }, "vocabulary")?.objective).toContain("word-choice mistake");
  });

  it("takes the first error of that skill, exactly as the result page does", () => {
    const vocab = { quote: "make a photo", correction: "take a photo", type: "vocabulary", pattern: "" };
    const goal = errorExampleGoal({ errors: [vocab, articleError, { ...articleError, quote: "second" }], error_patterns: [{ name: "Missing article", rule }] }, "grammar");
    expect(goal?.objective).toContain("Missing article");
    expect(errorExampleGoal({ errors: [articleError] }, "vocabulary")).toBeNull(); // no vocabulary error: no example, so the model's own advice stays
  });

  it("is null for fluency, cohesion and pronunciation, and when there are no errors", () => {
    expect(errorExampleGoal({ errors: [articleError] }, "fluency")).toBeNull();
    expect(errorExampleGoal({ errors: [articleError] }, "pronunciation")).toBeNull();
    expect(errorExampleGoal({ errors: [] }, "grammar")).toBeNull();
    expect(errorExampleGoal({}, "grammar")).toBeNull();
  });
});
