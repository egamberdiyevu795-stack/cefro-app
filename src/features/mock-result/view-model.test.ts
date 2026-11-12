import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ExamPartId } from "@/domain/speaking/exam-part";
import { MOCK_PARTS } from "@/domain/speaking/full-mock";
import { demoMockOptions, demoMockResult, type DemoMockOptions } from "@/server/demo/demo-mock";
import { MockResult } from "./MockResult";
import { NOT_DONE_PART, teacherRatingOf, type MockPartSource, type MockResultSource } from "./part-source";
import { bandsOf, buildMockResultView, teacherEstimate, weakestPart } from "./view-model";

const LABELS = ["Below", "Lower A", "Higher A", "Lower B", "Higher B", "Above"].map((label, band) => ({ band, label }));

/** A scored part with a band and a fix whose gap to its target is `gap`. */
function scored(part: ExamPartId, band: number, over: Partial<MockPartSource> = {}, gap = 2): MockPartSource {
  return {
    part,
    attemptId: `a-${part}`,
    taskTitle: `Task ${part}`,
    state: "scored",
    reason: null,
    band: { band, label: ["Below B1", "Lower B1", "Higher B1", "Lower B2", "Higher B2", "Above B2"][band], bandMax: 5, targetBand: band + gap },
    detailHref: `/result/a-${part}`,
    fix: { gap, view: { label: `Fix ${part}`, quoteLabel: "You said", quote: `q${part}`, adviceLabel: "Try instead", tryInstead: `t${part}`, goal: null }, retryHref: `/retry/${part}`, lesson: null },
    teacher: null,
    ...over,
  };
}
const scoring = (part: ExamPartId): MockPartSource => ({ ...NOT_DONE_PART(part), attemptId: `a-${part}`, state: "scoring", taskTitle: `Task ${part}`, detailHref: `/result/a-${part}` });
const source = (parts: MockPartSource[], status: MockResultSource["status"] = "finished"): MockResultSource => ({ id: "m1", status, createdAt: "2026-11-11T10:00:00.000Z", finishedAt: null, parts });
const four = (bands: [number, number, number, number]) => MOCK_PARTS.map((p, i) => scored(p, bands[i]));

describe("the estimate on the page", () => {
  it("shows the level and, under it, the exact line of docs/official-scale.md", () => {
    const view = buildMockResultView(source(four([3, 3, 3, 4])));
    expect(view.headline).toEqual({ kind: "level", level: "B2" });
    expect(view.levels).toEqual([{ name: "CEFRO", value: "B2" }]);
    expect(view.line).toBe("Speaking only. An estimate from this mock, not an official UZBMB score.");
    expect(view.title).toBe("Mock exam · 11.11.26");
  });

  it("reads each part's band from scored parts only", () => {
    expect(bandsOf([scored("1.1", 4), scoring("1.2"), NOT_DONE_PART("2"), scored("3", 5, { state: "not_scored", reason: "too_short", band: null })])).toEqual({
      "1.1": 4,
      "1.2": null,
      "2": null,
      "3": null,
    });
  });

  it("says 'Estimate not ready yet' and names the parts, with no level, while a needed part is scoring, missing or has no AI band", () => {
    const parts = [scored("1.1", 4), scored("1.2", 3), scoring("2"), { ...scored("3", 0), state: "not_scored" as const, reason: "ai_pending" as const, band: null, fix: null }];
    const view = buildMockResultView(source(parts));
    expect(view.headline).toEqual({ kind: "not_ready", title: "Estimate not ready yet", reason: "Part 2 is still being scored · Part 3 has no AI score yet." });
    expect(view.levels).toEqual([{ name: "CEFRO", value: null }]);
    const unfinished = buildMockResultView(source([scored("1.1", 4), NOT_DONE_PART("1.2"), NOT_DONE_PART("2"), NOT_DONE_PART("3")], "not_finished"));
    expect(unfinished.headline).toMatchObject({ kind: "not_ready", reason: "Part 1.2 was not done · Part 2 was not done · Part 3 was not done." });
    // A part that only Part 1.1 lacks does not stop the estimate: the rule does not read it.
    expect(buildMockResultView(source([scoring("1.1"), scored("1.2", 3), scored("2", 3), scored("3", 3)])).headline.kind).toBe("level");
  });
});

describe("two levels side by side", () => {
  const rated = (band: number) => ({ band, level: "B2" });
  it("shows 'Your teacher' beside CEFRO once the teacher rated every part the rule needs, and never instead of it", () => {
    const parts = four([3, 3, 3, 4]).map((p) => (p.part === "1.1" ? p : { ...p, teacher: rated(3) }));
    const view = buildMockResultView(source(parts));
    expect(view.levels).toEqual([
      { name: "CEFRO", value: "B2" },
      { name: "Your teacher", value: "B2" },
    ]);
    expect(view.rows.map((r) => r.teacherLevel)).toEqual([null, "B2", "B2", "B2"]);
  });

  it("can differ from ours: the teacher's level is their own, and the estimate stays ours", () => {
    const parts = four([3, 3, 3, 4]).map((p) => (p.part === "3" ? { ...p, teacher: { band: 5, level: "C1" } } : { ...p, teacher: rated(p.band!.band) }));
    const view = buildMockResultView(source(parts));
    expect(view.levels.map((l) => [l.name, l.value])).toEqual([["CEFRO", "B2"], ["Your teacher", "C1"]]);
  });

  it("shows nothing about a teacher when nobody rated, or when the rule's parts are only partly rated", () => {
    expect(buildMockResultView(source(four([3, 3, 3, 4]))).levels).toHaveLength(1);
    const partly = four([3, 3, 3, 4]).map((p) => (p.part === "2" ? { ...p, teacher: rated(3) } : p));
    const view = buildMockResultView(source(partly));
    expect(view.levels).toHaveLength(1);
    expect(view.rows[2].teacherLevel).toBe("B2"); // the one part they did rate still shows on its row
    expect(teacherEstimate(partly)).toBeNull();
  });

  it("shows the teacher's level even while the app's is not ready (the AI side may be empty)", () => {
    const parts = [scored("1.1", 3), { ...scored("1.2", 3), teacher: rated(3) }, { ...scored("2", 3), teacher: rated(3) }, { ...scoring("3"), teacher: rated(4) }];
    const view = buildMockResultView(source(parts));
    expect(view.levels).toEqual([
      { name: "CEFRO", value: null },
      { name: "Your teacher", value: "B2" },
    ]);
  });

  it("turns a teacher's rating into a band and a level: their band, or the app's when they agreed", () => {
    expect(teacherRatingOf({ agrees: false, teacherBand: 4, appBand: 2 }, LABELS)).toEqual({ band: 4, level: "B" });
    expect(teacherRatingOf({ agrees: true, teacherBand: null, appBand: 3 }, LABELS)).toEqual({ band: 3, level: "B" });
    expect(teacherRatingOf({ agrees: false, teacherBand: 9, appBand: 3 }, LABELS)).toBeNull();
  });
});

describe("the rows", () => {
  it("is one row per part in exam order: band and level, 'See details' to the part's own result", () => {
    const view = buildMockResultView(source(four([3, 3, 3, 4])));
    expect(view.rows.map((r) => [r.partLabel, r.cefro?.level, r.cefro?.bandText, r.detailHref])).toEqual([
      ["Part 1.1", "B2", "Band 3 · Lower B2", "/result/a-1.1"],
      ["Part 1.2", "B2", "Band 3 · Lower B2", "/result/a-1.2"],
      ["Part 2", "B2", "Band 3 · Lower B2", "/result/a-2"],
      ["Part 3", "B2", "Band 4 · Higher B2", "/result/a-3"],
    ]);
  });

  it("fills in as parts are scored: 'Scoring Part 2…' until then", () => {
    const view = buildMockResultView(source([scored("1.1", 3), scored("1.2", 3), scoring("2"), scoring("3")]));
    expect(view.scoring).toBe(true);
    expect(view.rows.map((r) => r.status)).toEqual([null, null, "Scoring Part 2…", "Scoring Part 3…"]);
    const done = buildMockResultView(source(four([3, 3, 3, 4])));
    expect(done.scoring).toBe(false);
    expect(done.rows.every((r) => r.status === null)).toBe(true);
  });

  it("says why a part has no band", () => {
    const part = (reason: MockPartSource["reason"]): MockPartSource => ({ ...scored("2", 0), state: "not_scored", reason, band: null, fix: null });
    const text = (reason: MockPartSource["reason"]) => buildMockResultView(source([part(reason)])).rows[0].status;
    expect(text("too_short")).toBe("Too short to rate");
    expect(text("no_speech")).toBe("No speech found");
    expect(text("ai_pending")).toBe("AI score not ready yet");
    expect(text("failed")).toBe("Not scored");
    expect(buildMockResultView(source([NOT_DONE_PART("3")])).rows[0].status).toBe("Not done");
  });
});

describe("the biggest fix across the mock", () => {
  it("is the fix of the part furthest below its own target, with its retry; a tie goes to the earlier part", () => {
    const parts = [scored("1.1", 3, {}, 1), scored("1.2", 3, {}, 3), scored("2", 3, {}, 3), scored("3", 3, {}, 2)];
    expect(weakestPart(parts)?.part).toBe("1.2");
    const view = buildMockResultView(source(parts));
    expect(view.fix).toMatchObject({ partLabel: "Part 1.2", retryHref: "/retry/1.2", lesson: null, fix: { label: "Fix 1.2" } });
  });

  it("carries the lesson link when the part has one", () => {
    const withLesson = scored("2", 2, { fix: { gap: 3, view: { label: "Q3", quoteLabel: "You said", quote: "x", adviceLabel: "Try instead", tryInstead: "y", goal: "z" }, retryHref: "/retry/2", lesson: { href: "/lessons/l-t1?attempt=a-2", title: "Answer every question" } } });
    const view = buildMockResultView(source([scored("1.2", 3), withLesson, scored("3", 3)]));
    expect(view.fix?.lesson).toEqual({ href: "/lessons/l-t1?attempt=a-2", title: "Answer every question" });
  });

  it("waits while any part is still scoring (it could change) and is empty when no part was scored", () => {
    const waiting = buildMockResultView(source([scored("1.1", 3), scoring("2")]));
    expect(waiting.fix).toBeNull();
    expect(waiting.fixWaiting).toBe(true);
    const none = buildMockResultView(source([NOT_DONE_PART("1.1"), NOT_DONE_PART("2")], "not_finished"));
    expect(none.fix).toBeNull();
    expect(none.fixWaiting).toBe(false);
  });
});

describe("not finished", () => {
  it("says 'Not finished' and keeps the parts that were done", () => {
    const view = buildMockResultView(source([scored("1.1", 3), scored("1.2", 3), NOT_DONE_PART("2"), NOT_DONE_PART("3")], "not_finished"));
    expect(view.notFinishedNote).toMatch(/^Not finished\./);
    expect(view.rows.map((r) => r.state)).toEqual(["scored", "scored", "not_done", "not_done"]);
    expect(buildMockResultView(source(four([3, 3, 3, 4]))).notFinishedNote).toBeNull();
  });
});

describe("the demo mock (mock mode) goes through the real evaluator types", () => {
  const BLACK = /class="[^"]*\bbg-primary text-on-primary\b/g;
  const render = (s: MockResultSource, demo = true) => renderToStaticMarkup(createElement(MockResult, { initial: s, demo, practiceHref: "/practice?mock=1" }));
  const variants: [string, DemoMockOptions][] = [
    ["finished", {}],
    ["finished, with a teacher", { teacher: true }],
    ["scoring", { state: "scoring" }],
    ["not finished", { state: "unfinished" }],
    ["AI score not ready", { state: "pending" }],
  ];

  it("has four scored parts, a level, a fix with a retry, and only mock-mode links", async () => {
    const s = await demoMockResult();
    const view = buildMockResultView(s);
    expect(s.parts.map((p) => p.part)).toEqual(["1.1", "1.2", "2", "3"]);
    expect(view.headline.kind).toBe("level");
    expect(view.fix?.retryHref).toContain("mock=1");
    expect(view.rows.every((r) => r.detailHref?.includes("mock=1"))).toBe(true);
    for (const p of s.parts) expect(p.attemptId, p.part).toMatch(/^demo-mock-|^p3\./);
  });

  it("reads the demo switches, and anything else is the finished demo", () => {
    expect(demoMockOptions({ state: "scoring", teacher: "1" })).toEqual({ state: "scoring", teacher: true });
    expect(demoMockOptions({ state: "nope" })).toEqual({ state: "finished", teacher: false });
  });

  it.each(variants)("%s: one black button, no text under 11 px, no score, no Passed / Failed, no certificate level", async (_name, options) => {
    const s = await demoMockResult(options);
    const html = render(s);
    expect((html.match(BLACK) ?? []).length).toBe(1);
    expect(html).not.toMatch(/text-\[(\d|10)(\.\d+)?px\]|text-xs\b/);
    expect(html).not.toMatch(/\bpassed\b|\bfailed\b|certificate/i);
    expect(html).not.toMatch(/\b\d{1,3}\s?\/\s?(30|75|120)\b/);
    expect(html).toContain("Speaking only. An estimate from this mock, not an official UZBMB score.");
  });

  it("the demo with a teacher shows 'CEFRO: B2' and 'Your teacher: B2' next to each other", async () => {
    const html = render(await demoMockResult({ teacher: true }));
    expect(html).toMatch(/CEFRO:<\/span> <span[^>]*>B2<\/span>/);
    expect(html).toMatch(/Your teacher:<\/span> <span[^>]*>B2<\/span>/);
    expect(html.indexOf("CEFRO:")).toBeLessThan(html.indexOf("Your teacher:"));
    const without = render(await demoMockResult());
    expect(without).not.toContain("Your teacher");
  });

  it("while scoring: 'Estimate not ready yet', 'Scoring Part 2…' and no fix yet; with 'Back to Practice' as the black button", async () => {
    const html = render(await demoMockResult({ state: "scoring" }));
    expect(html).toContain("Estimate not ready yet");
    expect(html).toContain("Scoring Part 2…");
    expect(html).toContain("Scoring Part 3…");
    expect(html).toContain("appears when every part is scored");
    expect(html).not.toContain("Retry with this goal");
    expect(html).toMatch(/bg-primary text-on-primary[^>]*>Back to Practice/);
  });

  it("with a retry the black button is 'Retry with this goal' and 'Back to Practice' is quiet", async () => {
    const html = render(await demoMockResult());
    expect(html).toMatch(/bg-primary text-on-primary[^>]*>(<svg.*?<\/svg>)?Retry with this goal/s);
    expect(html).not.toMatch(/bg-primary text-on-primary[^>]*>Back to Practice/);
  });
});

describe("the level a teacher gave the whole mock (docs/v1-plan.md step 6)", () => {
  const rated = (band: number) => ({ band, level: "B2" });
  it("is shown as 'Your teacher' beside CEFRO's level, and wins over the rule applied to part ratings", () => {
    const parts = four([3, 3, 3, 4]).map((p) => (p.part === "1.1" ? p : { ...p, teacher: rated(3) })); // part ratings would say B2
    const view = buildMockResultView({ id: "m", status: "finished", createdAt: "2026-11-01T09:00:00.000Z", finishedAt: null, parts, teacherLevel: "C1" });
    expect(view.levels.map((l) => [l.name, l.value])).toEqual([["CEFRO", "B2"], ["Your teacher", "C1"]]);
  });

  it("shows nothing when the teacher gave no level for the mock and rated no part", () => {
    const view = buildMockResultView({ id: "m", status: "finished", createdAt: "2026-11-01T09:00:00.000Z", finishedAt: null, parts: four([3, 3, 3, 4]), teacherLevel: null });
    expect(view.levels.map((l) => l.name)).toEqual(["CEFRO"]);
  });

  it("a whole-mock level is shown even when the AI estimate is not ready: the teacher's level carries it", () => {
    const parts = four([3, 3, 3, 4]).map((p) => (p.part === "3" ? { ...p, state: "not_scored" as const, reason: "ai_pending" as const, band: null } : p));
    const view = buildMockResultView({ id: "m", status: "finished", createdAt: "2026-11-01T09:00:00.000Z", finishedAt: null, parts, teacherLevel: "B2" });
    expect(view.levels).toEqual([{ name: "CEFRO", value: null }, { name: "Your teacher", value: "B2" }]);
  });
});
