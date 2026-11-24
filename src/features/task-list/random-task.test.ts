import { describe, expect, it } from "vitest";
import { pickRandomTopic, randomTopicHref } from "./random-task";

const IDS = ["a", "b", "c", "d", "e"];
const at = (day: number) => new Date(Date.UTC(2026, 10, day)).toISOString();
/** Every value `random` can lead to, by trying r = 0, 0.01, … 0.99. */
const outcomes = (ids: string[], practised: { taskId: string; createdAt: string }[]) =>
  new Set(Array.from({ length: 100 }, (_, i) => pickRandomTopic(ids, practised, () => i / 100)));

describe("pickRandomTopic", () => {
  it("no topics: null; one topic: that topic", () => {
    expect(pickRandomTopic([], [])).toBeNull();
    expect(pickRandomTopic(["a"], [{ taskId: "a", createdAt: at(1) }])).toBe("a");
  });

  it("first visit: any topic of the part can come up", () => {
    expect(outcomes(IDS, [])).toEqual(new Set(IDS));
  });

  it("only topics never practised come up while there are some", () => {
    const practised = [
      { taskId: "a", createdAt: at(1) },
      { taskId: "c", createdAt: at(2) },
      { taskId: "e", createdAt: at(3) },
    ];
    expect(outcomes(IDS, practised)).toEqual(new Set(["b", "d"]));
  });

  it("all practised: only the older half comes up, never the one practised last", () => {
    const practised = [
      { taskId: "e", createdAt: at(5) },
      { taskId: "a", createdAt: at(1) },
      { taskId: "d", createdAt: at(4) },
      { taskId: "b", createdAt: at(2) },
      { taskId: "c", createdAt: at(3) },
      { taskId: "a", createdAt: at(6) }, // practised again: now the most recent
    ];
    const seen = outcomes(IDS, practised);
    expect(seen).toEqual(new Set(["b", "c"]));
    expect(seen.has("a")).toBe(false);
  });

  it("two topics, both practised: the other one", () => {
    const practised = [
      { taskId: "a", createdAt: at(1) },
      { taskId: "b", createdAt: at(2) },
    ];
    expect(outcomes(["a", "b"], practised)).toEqual(new Set(["a"]));
  });

  it("ignores attempts of other parts", () => {
    expect(outcomes(["a", "b"], [{ taskId: "zzz", createdAt: at(1) }])).toEqual(new Set(["a", "b"]));
  });
});

describe("randomTopicHref", () => {
  it("keeps mock mode", () => {
    expect(randomTopicHref("2")).toBe("/practice/random/2");
    expect(randomTopicHref("3", { mock: true })).toBe("/practice/random/3?mock=1");
  });
});
