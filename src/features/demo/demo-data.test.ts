import { describe, expect, it } from "vitest";
import { getSpeakingTask, listSpeakingTasks } from "@/content/speaking";
import { examDateState } from "@/domain/exam-date";
import type { FeatureLevel } from "@/domain/evaluation/multilevel/levels";
import { dashboardFix, dashboardView, partTiles, practiseNext, progress, scoredAttempts } from "@/features/dashboard/progress";
import { buildHistoryView, toHistoryRows } from "@/features/history/view-model";
import { RETRY_CURRENT, RETRY_PREVIOUS, evaluationOf } from "@/features/result/mock-data";
import { demoAttempts, demoExamDate, demoHref, demoResultHref, demoTranscript, DEMO_EXAM_IN_DAYS } from "./demo-data";
import { isMockQuery, mockLink, withMock } from "./demo-mode";

const NOW = new Date("2026-11-07T09:00:00Z");
const attempts = demoAttempts(NOW);
const tasks = listSpeakingTasks();

describe("withMock / isMockQuery", () => {
  it("adds mock=1 to internal links, keeps the rest of the link, and leaves external links alone", () => {
    expect(withMock("/")).toBe("/?mock=1");
    expect(withMock("/dashboard")).toBe("/dashboard?mock=1");
    expect(withMock("/#part-2")).toBe("/?mock=1#part-2");
    expect(withMock("/history?part=2&show=40")).toBe("/history?part=2&show=40&mock=1");
    expect(withMock("/result?mock=1&anchor=x")).toBe("/result?mock=1&anchor=x");
    expect(withMock("https://example.com/")).toBe("https://example.com/");
    expect(withMock("//example.com/")).toBe("//example.com/");
    expect(mockLink("/history", false)).toBe("/history");
  });

  it("only exactly ?mock=1 is mock mode", () => {
    expect(isMockQuery({ mock: "1" })).toBe(true);
    expect(isMockQuery({ mock: ["1", "0"] })).toBe(true);
    for (const mock of [undefined, "", "0", "true", "yes"]) expect(isMockQuery({ mock })).toBe(false);
  });
});

describe("the demo student", () => {
  it("has a few attempts across several Part 2 tasks, newest first, all of real tasks", () => {
    expect(attempts.length).toBeGreaterThanOrEqual(5);
    expect(new Set(attempts.map((a) => a.taskId)).size).toBeGreaterThanOrEqual(4);
    for (const a of attempts) {
      expect(getSpeakingTask(a.taskId)?.title).toBe(a.title);
      expect(a.part).toBe("2");
    }
    const times = attempts.map((a) => Date.parse(a.createdAt));
    expect([...times].sort((x, y) => y - x)).toEqual(times);
    expect(Math.max(...times)).toBeLessThan(NOW.getTime());
  });

  it("is a returning student: scored answers, a level, a biggest fix with its quote, a not-scored attempt", () => {
    expect(dashboardView(attempts)).toBe("returning");
    expect(scoredAttempts(attempts).length).toBeGreaterThanOrEqual(3);
    expect(attempts.some((a) => a.status === "failed")).toBe(true);
    const summary = progress(attempts, { target: "B2" as FeatureLevel, now: NOW });
    expect(summary?.level).toBeTruthy();
    const latest = scoredAttempts(attempts)[0];
    const fix = dashboardFix(attempts, { prompts: (id) => getSpeakingTask(id)?.prompts ?? [], transcript: demoTranscript(latest.id), target: "B2" as FeatureLevel });
    expect(fix?.fix.quote).toBeTruthy();
    expect(practiseNext(attempts, tasks)).not.toBeNull();
  });

  it("has a retry with a goal, shown as the result prototype's retry screen shows it", () => {
    const retry = attempts.find((a) => a.previousAttemptId);
    expect(retry).toBeDefined();
    const original = attempts.find((a) => a.id === retry!.previousAttemptId)!;
    expect(original.result?.retry_focus[0]?.objective).toBeTruthy(); // the goal it was given
    // Its row and its demo result agree: the prototype's retry screen always shows RETRY_CURRENT, so the demo retry
    // is scored with it, and its result link names the original's saved run as `from`.
    expect(retry!.result).toEqual(evaluationOf(RETRY_CURRENT.anchor, RETRY_CURRENT.run).result);
    expect(original.result).toEqual(evaluationOf(RETRY_PREVIOUS.anchor, RETRY_PREVIOUS.run).result);
    expect(demoResultHref(retry!.id)).toBe(`/result?state=retry&from=${RETRY_PREVIOUS.anchor}&fromRun=${RETRY_PREVIOUS.run}&mock=1`);
    const row = toHistoryRows([retry!], attempts)[0];
    expect(row.retry?.goal).toMatch(/^(Goal met|Not yet)$/);
  });

  it("has an exam date ahead", () => {
    const state = examDateState(demoExamDate(NOW), NOW);
    expect(state).toMatchObject({ kind: "countdown", days: DEMO_EXAM_IN_DAYS });
  });
});

describe("demo links keep mock mode", () => {
  const isMockLink = (href: string) => href.startsWith("/") && new URL(href, "http://x").searchParams.get("mock") === "1";

  it("every link the dashboard and History build from the demo attempts opens a mock page", () => {
    const latest = scoredAttempts(attempts)[0];
    const fix = dashboardFix(attempts, { prompts: (id) => getSpeakingTask(id)?.prompts ?? [], transcript: demoTranscript(latest.id), target: "B2" as FeatureLevel })!;
    const view = buildHistoryView(attempts, { filter: "all", show: 20 });
    const hrefs = [
      fix.retryHref,
      practiseNext(attempts, tasks)!.href,
      ...partTiles(attempts).flatMap((t) => (t.href ? [t.href] : [])),
      ...view.rows.map((r) => r.href),
      ...view.filters.map((f) => f.href),
    ].map(demoHref);
    for (const href of hrefs) {
      expect(isMockLink(href), href).toBe(true);
      expect(href, "no real result page").not.toMatch(/^\/result\//);
      expect(href, "no demo id reaches the practice page").not.toMatch(/retry=demo-/);
    }
  });

  it("a retry of a demo attempt retries its saved run (same goal); a demo result opens the prototype", () => {
    expect(demoHref("/practice/speaking/b2-part2-advice-from-someone?retry=demo-6")).toBe(
      `/practice/speaking/b2-part2-advice-from-someone?mock=1&retry=${RETRY_CURRENT.anchor}&run=${RETRY_CURRENT.run}`,
    );
    expect(demoHref("/result/demo-5")).toBe("/result?anchor=A2-b1-all-three&run=1&mock=1");
    expect(demoHref("/result/demo-3")).toBe("/result?state=no-speech&mock=1");
    expect(demoHref("/result/unknown")).toBe("/result?mock=1");
    expect(demoHref("/#part-2")).toBe("/?mock=1#part-2");
  });
});
