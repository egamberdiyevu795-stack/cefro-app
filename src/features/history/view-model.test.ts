import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MultilevelResult } from "@/domain/evaluation/multilevel/result";
import { listSpeakingTasks } from "@/content/speaking";
import { examPartOf } from "@/domain/speaking/exam-part";
import type { HistoryAttempt } from "@/domain/speaking/history";
import { LIVE_36_FLASH_FIXTURES } from "../../../test/fixtures/live-3.6-flash";
import { HistoryContent } from "./sections";
import { buildHistoryView, formatDate, levelOfBand, PAGE_SIZE, parseHistoryQuery, toHistoryRows, type HistoryView } from "./view-model";

/** A saved live evaluator result (band 2 for A2 run 1, band 4 for A4 run 1, band 3 for A3 run 1, band 5 for A5). */
function result(anchor: string, run = 1): MultilevelResult {
  return structuredClone(LIVE_36_FLASH_FIXTURES[anchor].runs[run - 1].evaluation.result as MultilevelResult);
}

let n = 0;
/** One attempt; `day` = days after 1 Nov 2026, so a larger day is newer. */
function attempt(over: Partial<HistoryAttempt> & { day: number }): HistoryAttempt {
  n += 1;
  const { day, ...rest } = over;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    taskId: "b2-part2-advice-from-someone",
    title: "Advice from someone",
    part: "2",
    createdAt: new Date(Date.UTC(2026, 10, 1 + day, 9)).toISOString(),
    status: "completed",
    isStalled: false,
    failureCode: null,
    recordingDurationMs: 108_000,
    previousAttemptId: null,
    result: result("A2-b1-all-three"),
    ...rest,
  };
}

/** Newest first, as the server returns them. */
const newestFirst = (list: HistoryAttempt[]) => [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
const view = (list: HistoryAttempt[], query: Record<string, string> = {}) => buildHistoryView(newestFirst(list), parseHistoryQuery(query));

const BLACK = /class="[^"]*\bbg-primary text-on-primary\b/g;
const render = (v: HistoryView) => renderToStaticMarkup(createElement(HistoryContent, { view: v }));

describe("history list", () => {
  it("lists every attempt newest first, each opening its own result page", () => {
    const old = attempt({ day: 0 });
    const latest = attempt({ day: 3, result: result("A4-b2-all-three") });
    const middle = attempt({ day: 1 });
    const v = view([old, latest, middle]);
    expect(v.rows.map((r) => r.id)).toEqual([latest.id, middle.id, old.id]);
    expect(v.rows[0]).toMatchObject({ href: `/result/${latest.id}`, title: "Advice from someone", partLabel: "Part 2", date: "04.11.26" });
  });

  it("shows the level as the main value and the band with its label", () => {
    const [row] = toHistoryRows([attempt({ day: 0, result: result("A2-b1-all-three") })]);
    expect(row.outcome).toEqual({ kind: "scored", level: "B1", band: 2, bandLabel: "Higher B1" });
    expect(levelOfBand("Lower B2")).toBe("B2");
    expect(levelOfBand("Above B2")).toBe("Above B2");
    expect(levelOfBand("Below B1")).toBe("Below B1");
  });

  it("an answer being scored says Scoring…; failed, stalled and too-short answers say Not scored", () => {
    const tooShort = result("A2-b1-all-three");
    tooShort.scoring = { ...tooShort.scoring, band: 0, label: "Below B1", zero_reason: "too_short" };
    const rows = toHistoryRows([
      attempt({ day: 4, status: "evaluating", result: null }),
      attempt({ day: 3, status: "failed", failureCode: "evaluation_failed", result: null }),
      attempt({ day: 2, status: "processing", isStalled: true, result: null }),
      attempt({ day: 1, result: tooShort }),
      attempt({ day: 0, result: null }), // completed with the old method: no band
    ]);
    expect(rows.map((r) => r.outcome.kind)).toEqual(["scoring", "not_scored", "not_scored", "not_scored", "not_scored"]);
  });

  it("marks retries, with Goal met / Not yet once scored", () => {
    const first = attempt({ day: 0, result: result("A3-b2-q3-missing") });
    const review = (outcome: "achieved" | "partly_achieved" | "not_achieved") => {
      const r = result("A4-b2-all-three");
      r.assessment.retry_review = { objectives: [{ objective: "o", outcome, evidence: "e" }], summary: "s" };
      return r;
    };
    const met = attempt({ day: 1, previousAttemptId: first.id, result: review("achieved") });
    const partly = attempt({ day: 2, previousAttemptId: first.id, result: review("partly_achieved") });
    const notMet = attempt({ day: 3, previousAttemptId: first.id, result: review("not_achieved") });
    const scoring = attempt({ day: 4, previousAttemptId: first.id, status: "evaluating", result: null });
    const rows = view([first, met, partly, notMet, scoring]).rows;
    expect(rows.map((r) => r.retry)).toEqual([{ goal: null }, { goal: "Not yet" }, { goal: "Not yet" }, { goal: "Goal met" }, null]);
    const html = render(view([first, met]));
    expect(html).toContain("Retry");
    expect(html).toContain("Goal met");
  });

  it("filters by part and offers only the parts the student has tried", () => {
    const part2 = attempt({ day: 0 });
    const part11 = attempt({ day: 1, part: "1.1", title: "Daily life", result: null });
    const v = view([part2, part11]);
    expect(v.filters.map((f) => [f.label, f.href, f.active])).toEqual([
      ["All", "/history", true],
      ["Part 1.1", "/history?part=1.1", false],
      ["Part 2", "/history?part=2", false],
    ]);
    const filtered = view([part2, part11], { part: "2" });
    expect(filtered.rows.map((r) => r.id)).toEqual([part2.id]);
    expect(filtered.filters.find((f) => f.active)?.label).toBe("Part 2");
    // A part never tried (or a made-up value) shows everything.
    expect(view([part2, part11], { part: "3" }).filter).toBe("all");
    expect(view([part2, part11], { part: "<script>" }).rows).toHaveLength(2);
  });

  it("long histories: 20 at first, then Show more adds 20", () => {
    const many = Array.from({ length: 45 }, (_, i) => attempt({ day: i }));
    const first = view(many);
    expect(first.rows).toHaveLength(PAGE_SIZE);
    expect(first.moreHref).toBe("/history?show=40");
    const second = view(many, { show: "40" });
    expect(second.rows).toHaveLength(40);
    expect(second.moreHref).toBe("/history?show=60");
    const third = view(many, { show: "60" });
    expect(third.rows).toHaveLength(45);
    expect(third.moreHref).toBeNull();
    expect(render(first)).toContain("Show more");
    expect(render(third)).not.toContain("Show more");
    // The filter is kept when showing more.
    expect(view(many, { part: "2" }).moreHref).toBe("/history?part=2&show=40");
    // Untrusted values fall back to 20.
    expect(parseHistoryQuery({ show: "-5" }).show).toBe(PAGE_SIZE);
    expect(parseHistoryQuery({ show: "abc" }).show).toBe(PAGE_SIZE);
  });
});

describe("band over time", () => {
  it("is hidden below 3 scored attempts of the part, shown from 3, oldest first, with the target band", () => {
    const two = [attempt({ day: 0 }), attempt({ day: 1, status: "evaluating", result: null }), attempt({ day: 2, result: result("A4-b2-all-three") })];
    expect(view(two).chart).toBeNull();
    expect(render(view(two))).not.toContain("Band over time");

    const three = [...two, attempt({ day: 3, result: result("A3-b2-q3-missing") })];
    const chart = view(three).chart!;
    expect(chart).toMatchObject({ part: "2", partLabel: "Part 2", bandMax: 5, targetBand: 3 });
    expect(chart.points.map((p) => p.band)).toEqual([2, 4, 3]);
    const html = render(view(three));
    expect(html).toContain("Band over time");
    expect(html).toContain("Target · Band 3");
  });

  it("follows the selected part; under All it shows the latest attempt's part", () => {
    const list = [
      attempt({ day: 0 }),
      attempt({ day: 1 }),
      attempt({ day: 2 }),
      attempt({ day: 3, part: "1.2", title: "Shopping", result: null }),
    ];
    expect(view(list).chart).toBeNull(); // latest is Part 1.2, which has no scored attempts
    expect(view(list, { part: "2" }).chart?.points).toHaveLength(3);
  });

  it("too-short answers are not points; at most the last 20 are drawn", () => {
    const tooShort = result("A2-b1-all-three");
    tooShort.scoring = { ...tooShort.scoring, band: 0, zero_reason: "too_short" };
    const list = Array.from({ length: 25 }, (_, i) => attempt({ day: i }));
    list.push(attempt({ day: 30, result: tooShort }));
    const chart = view(list).chart!;
    expect(chart.points).toHaveLength(20);
    expect(chart.olderHidden).toBe(5);
    expect(chart.points.every((p) => p.band === 2)).toBe(true);
  });
});

describe("history markup", () => {
  const scored = [0, 1, 2].map((day) => attempt({ day }));
  const cases: Array<[string, HistoryView, number]> = [
    ["empty", view([]), 1],
    ["few attempts (no chart)", view([attempt({ day: 0 })]), 0],
    ["full", view(scored), 0],
    ["filtered", view([...scored, attempt({ day: 5, part: "1.1", result: null })], { part: "2" }), 0],
    ["long", view(Array.from({ length: 30 }, (_, i) => attempt({ day: i }))), 0],
  ];

  it.each(cases)("%s: the right number of black buttons, no text under 11 px", (_name, v, expected) => {
    const html = render(v);
    expect((html.match(BLACK) ?? []).length).toBe(expected);
    expect(html).not.toMatch(/text-\[(\d|10)(\.\d+)?px\]|text-xs\b/);
  });

  it("empty state: no list, no filter, no chart, and Start your first practice", () => {
    const html = render(view([]));
    expect(html).toContain("No attempts yet");
    expect(html).toContain("Start your first practice");
    expect(html).not.toContain("Filter by part");
    expect(html).not.toContain("Band over time");
  });

  it("the chart has a table for screen readers", () => {
    const html = render(view(scored));
    expect(html).toMatch(/<table class="sr-only">/);
    expect(html.match(/<tr>/g)).toHaveLength(4); // header + 3 points
  });
});

describe("exam parts and dates", () => {
  it("maps a task to its exam part (Part 1 by its target)", () => {
    expect(examPartOf({ part: 2, level: "B2" })).toBe("2");
    expect(examPartOf({ part: 3, level: "C1" })).toBe("3");
    expect(examPartOf({ part: 1, level: "A2" })).toBe("1.1");
    expect(examPartOf({ part: 1, level: "B1" })).toBe("1.2");
    expect(examPartOf({ part: 4, level: "B2" })).toBeNull();
  });

  it("dates are dd.mm.yy in Uzbekistan time", () => {
    expect(formatDate("2026-11-04T09:00:00.000Z")).toBe("04.11.26");
    expect(formatDate("2026-11-04T20:00:00.000Z")).toBe("05.11.26"); // 01:00 in Tashkent
  });
});

describe("with the 7 real Part 2 tasks", () => {
  const tasks = listSpeakingTasks();
  const list = tasks.map((t, i) => attempt({ day: i, taskId: t.id, title: t.title }));

  it("lists one row per task, newest first, each with its own title, under All and under Part 2", () => {
    const all = view(list);
    expect(all.rows.map((r) => r.title)).toEqual([...tasks].reverse().map((t) => t.title));
    expect(all.rows.every((r) => r.partLabel === "Part 2")).toBe(true);
    expect(view(list, { part: "2" }).rows).toHaveLength(7);
    // Every attempt is Part 2, so the chart shows them all, whatever task they came from.
    expect(all.chart?.points).toHaveLength(7);
  });

  it("renders every title, one black button at most, no text under 11 px", () => {
    const html = render(view(list));
    for (const t of tasks) expect(html).toContain(t.title);
    expect((html.match(BLACK) ?? []).length).toBe(0);
    expect(html).not.toMatch(/text-\[(\d|10)(\.\d+)?px\]|text-xs\b/);
  });
});
