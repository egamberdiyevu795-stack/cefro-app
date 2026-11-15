import { describe, expect, it } from "vitest";
import { pickWeightedTask } from "@/domain/speaking/full-mock";
import { seededRandom } from "@/domain/speaking/weighted-pick";
import { getArgumentTask, listArgumentTasks, part3TopicWeight } from "../part3";
import { PART3_BANK_META, PART3_BANK_TASKS } from "./part-3-bank";

describe("Part 3 topic bank (2026-11-15)", () => {
  it("has the teacher's frequent topics (university row split in two), the rarer ones and the screenshot topic", () => {
    const by = (source: string) => PART3_BANK_TASKS.filter((t) => PART3_BANK_META[t.id]!.source === source).length;
    expect(by("frequent")).toBe(9);
    expect(by("rare")).toBe(7); // gambling left out on purpose
    expect(by("exam screenshot")).toBe(1);
  });

  it("weights: the teacher's counts for frequent topics, 1 for the rest and for our v1 topics", () => {
    expect(part3TopicWeight("c1-part3-social-media-under-16")).toBe(5);
    expect(part3TopicWeight("c1-part3-optional-homework")).toBe(4);
    expect(part3TopicWeight("c1-part3-ban-zoos")).toBe(3);
    expect(part3TopicWeight("c1-part3-free-university") + part3TopicWeight("c1-part3-degree-for-success")).toBe(4);
    expect(part3TopicWeight("c1-part3-electric-cars")).toBe(1);
    expect(part3TopicWeight("c1-part3-cars-in-city-centres")).toBe(1);
  });

  it("the points are our own: none of the real exam screenshots' wording", () => {
    const text = JSON.stringify(PART3_BANK_TASKS).toLowerCase();
    for (const phrase of [
      "where they belong",
      "prevent extinction",
      "poaching",
      "zero emissions",
      "hazardous materials",
      "erode cultural diversity",
      "minimize miscommunication",
      "not enough electric charging stations",
    ]) expect(text).not.toContain(phrase);
  });

  it("every bank topic is a Part 3 task the list and the mock can open", () => {
    for (const t of PART3_BANK_TASKS) expect(getArgumentTask(t.id)).toBe(t);
  });
});

describe("pickWeightedTask (Part 3 in the mock)", () => {
  const tasks = listArgumentTasks();
  const weight = (t: { id: string }) => part3TopicWeight(t.id);

  it("frequent topics come up most (seeded, 20,000 picks)", () => {
    const random = seededRandom(3);
    const counts = new Map<string, number>();
    for (let i = 0; i < 20_000; i++) {
      const id = pickWeightedTask(tasks, weight, [], random)!.id;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const total = tasks.reduce((s, t) => s + weight(t), 0);
    const share = (id: string) => (counts.get(id) ?? 0) / 20_000;
    expect(share("c1-part3-social-media-under-16")).toBeCloseTo(5 / total, 1);
    expect(share("c1-part3-social-media-under-16")).toBeGreaterThan(4 * share("c1-part3-space-exploration"));
    expect(counts.size).toBe(tasks.length);
  });

  it("never repeats one of the latest three topics", () => {
    const history = ["c1-part3-social-media-under-16", "c1-part3-optional-homework", "c1-part3-books-or-films"].map((taskId, i) => ({
      taskId,
      createdAt: new Date(Date.UTC(2026, 10, 10 + i)).toISOString(),
    }));
    const random = seededRandom(8);
    for (let i = 0; i < 2_000; i++) expect(history.map((h) => h.taskId)).not.toContain(pickWeightedTask(tasks, weight, history, random)!.id);
  });

  it("is deterministic with a seed, and never leaves nothing to pick", () => {
    expect(pickWeightedTask(tasks, weight, [], seededRandom(1))).toBe(pickWeightedTask(tasks, weight, [], seededRandom(1)));
    const one = [tasks[0]!];
    expect(pickWeightedTask(one, weight, [{ taskId: one[0]!.id, createdAt: "2026-11-15T00:00:00Z" }])).toBe(one[0]);
  });
});
