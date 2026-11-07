import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getSpeakingTask, listSpeakingTasks } from "@/content/speaking";
import { examDateState } from "@/domain/exam-date";
import type { FeatureLevel } from "@/domain/evaluation/multilevel/levels";
import { dashboardFix, dashboardView, partTiles, practiseNext, progress, scoredAttempts } from "@/features/dashboard/progress";
import { buildHistoryView, toHistoryRows } from "@/features/history/view-model";
import { compareWithPrevious, resultPageState } from "@/features/result/view-model";
import { demoPracticeKey, demoScoringHref } from "@/features/speaking-practice/lib/practice-flow";
import {
  DEMO_ATTEMPT_IDS,
  DEMO_EXAM_IN_DAYS,
  demoAttemptView,
  demoAttempts,
  demoEvaluation,
  demoExamDate,
  demoHref,
  demoResultHref,
  demoResultSource,
  demoResultSpec,
  demoTranscript,
} from "./demo-data";
import { DEMO_ANSWERS } from "@/features/demo/demo-answers";
import { isMockQuery, mockLink, withMock } from "@/features/demo/demo-mode";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }) }));

const NOW = new Date("2026-11-07T09:00:00Z");
const attempts = await demoAttempts(NOW);
const tasks = listSpeakingTasks();
const B2 = "B2" as FeatureLevel;
const fixOf = () =>
  dashboardFix(attempts, { prompts: (id) => getSpeakingTask(id)?.prompts ?? [], transcript: demoTranscript(scoredAttempts(attempts)[0].id), target: B2 });

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
    expect(attempts.map((a) => a.id)).toEqual(DEMO_ATTEMPT_IDS);
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
    expect(progress(attempts, { target: B2, now: NOW })?.level).toBeTruthy();
    expect(fixOf()?.fix.quote).toBeTruthy();
    expect(practiseNext(attempts, tasks)).not.toBeNull();
  });

  it("has a retry with a goal (answer question 3), and the retry met it", () => {
    const retry = attempts.find((a) => a.previousAttemptId)!;
    const original = attempts.find((a) => a.id === retry.previousAttemptId)!;
    expect(retry.taskId).toBe(original.taskId);
    expect(original.result!.retry_focus[0].objective).toMatch(/^Answer question 3/);
    expect(compareWithPrevious(original.result!, retry.result!).goal).toBe("met");
    expect(toHistoryRows([retry], attempts)[0].retry?.goal).toBe("Goal met");
  });

  it("has an exam date ahead", () => {
    expect(examDateState(demoExamDate(NOW), NOW)).toMatchObject({ kind: "countdown", days: DEMO_EXAM_IN_DAYS });
  });
});

describe("demo results match their task", () => {
  it("every demo attempt's result has the same task id and questions as the attempt", async () => {
    for (const attempt of attempts) {
      const task = getSpeakingTask(attempt.taskId)!;
      const source = (await demoResultSource(attempt.id))!;
      expect(source.task.id, attempt.id).toBe(attempt.taskId);
      expect(source.task.title).toBe(attempt.title);
      expect(source.task.prompts).toEqual(task.prompts);
      if (attempt.status === "failed") {
        expect(resultPageState(source)).toMatchObject({ kind: "not_scored", reason: "no_speech", task: { id: attempt.taskId } });
        continue;
      }
      // The result is the one the attempt row shows, judged on the attempt's own three questions.
      expect(source.evaluation?.result).toEqual(attempt.result);
      expect(attempt.result!.assessment.questions.map((q) => q.id)).toEqual(task.prompts.map((_, i) => i + 1));
      for (const focus of attempt.result!.retry_focus) {
        const quoted = /^Answer question (\d) [^"]*"(.*)"$/.exec(focus.objective);
        if (quoted) expect(quoted[2]).toBe(task.prompts[Number(quoted[1]) - 1]);
      }
      expect(source.transcript).toBe(demoTranscript(attempt.id));
      // Its page: the attempt's own task and questions, no other task's.
      const state = resultPageState(source);
      expect(state.kind).toBe("scored");
      if (state.kind !== "scored") continue;
      const { ScoredResult } = await import("@/features/result/sections");
      const { FEATURE_FLAGS } = await import("@/config/features");
      const html = renderToStaticMarkup(createElement(ScoredResult, { view: state.view, task: source.task, flags: FEATURE_FLAGS, retryHref: "/", demo: true }));
      expect(html).toContain(escape(task.title));
      for (const other of tasks.filter((t) => t.id !== task.id)) expect(html, `${attempt.id} shows ${other.title}`).not.toContain(escape(other.prompts[0]));
    }
  });

  it("the result of a mock practice of any task, and of its retry, is for that task", async () => {
    for (const task of tasks) {
      const first = demoPracticeKey(task.id, null);
      const retry = demoPracticeKey(task.id, first);
      for (const key of [first, retry]) {
        const source = (await demoResultSource(key))!;
        expect(source.task.id, key).toBe(task.id);
        expect(source.evaluation!.result.assessment.questions).toHaveLength(task.prompts.length);
        expect(demoTranscript(key)).toContain(DEMO_ANSWERS[task.id].story[0]);
      }
      expect((await demoResultSource(retry))!.previous?.evaluation.result).toEqual((await demoEvaluation(first))!.result);
      expect((await demoAttemptView(first))!.taskId).toBe(task.id);
      expect(demoScoringHref(task.id, null)).toBe(`/result?demo=answer.${task.id}&state=scoring&next=1&mock=1`);
    }
  });

  it("no result borrows the advice task's topic (the mock evaluator's tips and model answers are task-neutral)", async () => {
    for (const task of tasks.filter((t) => t.id !== "b2-part2-advice-from-someone")) {
      for (const key of [demoPracticeKey(task.id, null), demoPracticeKey(task.id, demoPracticeKey(task.id, null))]) {
        expect(JSON.stringify((await demoEvaluation(key))!.result), key).not.toMatch(/advice|older people/i);
      }
    }
  });

  it("unknown keys, and a retry of another task's result, are not demo results", async () => {
    for (const key of ["demo-99", "answer.unknown", "retry.b2-part2-happy-day.demo-6", "retry.b2-part2-happy-day.nope", "../etc"]) {
      expect(demoResultSpec(key), key).toBeNull();
      expect(await demoResultSource(key)).toBeNull();
    }
  });
});

describe("demo links keep mock mode", () => {
  const isMockLink = (href: string) => href.startsWith("/") && new URL(href, "http://x").searchParams.get("mock") === "1";

  it("every link the dashboard and History build from the demo attempts opens a mock page", () => {
    const view = buildHistoryView(attempts, { filter: "all", show: 20 });
    const hrefs = [
      fixOf()!.retryHref,
      practiseNext(attempts, tasks)!.href,
      ...partTiles(attempts).flatMap((t) => (t.href ? [t.href] : [])),
      ...view.rows.map((r) => r.href),
      ...view.filters.map((f) => f.href),
    ].map(demoHref);
    for (const href of hrefs) {
      expect(isMockLink(href), href).toBe(true);
      expect(href, "no real result page").not.toMatch(/^\/result\//);
    }
  });

  it("a demo attempt's result and its retry keep the attempt and its task", () => {
    expect(demoHref("/result/demo-1")).toBe("/result?demo=demo-1&mock=1");
    expect(demoResultHref("demo-3")).toBe("/result?demo=demo-3&mock=1");
    expect(demoHref("/result/unknown")).toBe("/result?mock=1");
    expect(demoHref("/practice/speaking/b2-part2-a-tradition?retry=demo-6")).toBe("/practice/speaking/b2-part2-a-tradition?mock=1&retry=demo-6");
    // A retry of another task's attempt is dropped.
    expect(demoHref("/practice/speaking/b2-part2-happy-day?retry=demo-6")).toBe("/practice/speaking/b2-part2-happy-day?mock=1");
    expect(demoHref("/#part-2")).toBe("/?mock=1#part-2");
  });
});

/** As the markup has it. */
function escape(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("'", "&#x27;").replaceAll('"', "&quot;");
}
