import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getSpeakingTask } from "@/content/speaking";
import { toPublicTask } from "@/domain/speaking/task";
import { mockRetryAttempt, mockResultHref, mockResultSource, selectMock } from "@/features/result/mock-data";
import { ScoringResult } from "@/features/result/sections";
import { GOAL_LABEL, resultPageState } from "@/features/result/view-model";
import { FEATURE_FLAGS } from "@/config/features";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { isEarlyFinish, mockScoringHref, practiceHref, retryGoalOf } from "../lib/practice-flow";
import { BriefCard, MicrophoneState, PracticeLayout, PreparationCard, RecordingCard, TaskCard, type MicrophoneStateKind } from "./screens";

const speakingTask = getSpeakingTask("b2-part2-advice-from-someone")!;
const task = toPublicTask(speakingTask);
const config = getSpeakingRubric(speakingTask).config;
const noop = () => undefined;
const goal = retryGoalOf(mockRetryAttempt({ anchor: "A2-b1-all-three", run: 1 }, task));

const BLACK = /class="[^"]*\bbg-primary text-on-primary\b/g;
const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const blacks = (markup: string) => (markup.match(BLACK) ?? []).length;
const screen = (step: React.ReactElement) => html(createElement(PracticeLayout, { task: createElement(TaskCard, { task }), step }));

const SCREENS: Array<[string, React.ReactElement, number]> = [
  ["brief", createElement(BriefCard, { task, goal: null, onStart: noop }), 1],
  ["brief (retry)", createElement(BriefCard, { task, goal, onStart: noop, onDropGoal: noop }), 1],
  ["preparation", createElement(PreparationCard, { task, remainingMs: 42_000, goal, onSkip: noop }), 0],
  ["recording", createElement(RecordingCard, { task, remainingMs: 90_000, level: 0.5, goal, earlyWarning: false, onFinish: noop, onKeepSpeaking: noop, onFinishAnyway: noop }), 1],
  ["recording, early warning", createElement(RecordingCard, { task, remainingMs: 100_000, level: 0.5, goal, earlyWarning: true, onFinish: noop, onKeepSpeaking: noop, onFinishAnyway: noop }), 1],
  ...(["asking", "permission_denied", "no_microphone", "recorder_failed", "unsupported"] as MicrophoneStateKind[]).map(
    (kind) =>
      [`microphone ${kind}`, createElement(BriefCard, { task, goal: null, onStart: noop, microphone: createElement(MicrophoneState, { kind, onRetry: noop }) }), kind === "asking" || kind === "unsupported" ? 0 : 1] as [string, React.ReactElement, number],
  ),
];

describe("practice screens", () => {
  it.each(SCREENS)("%s: the right number of black buttons, no text under 11 px, questions and picture shown", (_name, step, expected) => {
    const markup = screen(step);
    expect(blacks(markup)).toBe(expected);
    expect(markup).not.toMatch(/text-\[(\d|10)(\.\d+)?px\]|text-xs\b/);
    for (const prompt of task.prompts) expect(markup).toContain(prompt.replace(/'/g, "&#x27;"));
    expect(markup).toContain("You don&#x27;t need to describe the picture");
  });

  it("brief shows the title, timings and one 'Start preparation'", () => {
    const markup = screen(createElement(BriefCard, { task, goal: null, onStart: noop }));
    expect(markup).toContain(task.title);
    expect(markup).toContain("1 min");
    expect(markup).toContain("2 min");
    expect(markup).toContain("Start preparation");
    expect(markup).not.toContain("Your goal:");
  });

  it("a retry shows 'Your goal: …' on brief, preparation and recording", () => {
    expect(goal?.objective).toBeTruthy();
    for (const [, step] of SCREENS.slice(1, 5)) expect(html(step)).toContain("Your goal:</span> " + goal!.objective.replace(/'/g, "&#x27;"));
  });

  it("the microphone states: asking has no button; denied says how to fix it on each device", () => {
    expect(html(createElement(MicrophoneState, { kind: "asking", onRetry: noop }))).not.toContain("<button");
    const denied = html(createElement(MicrophoneState, { kind: "permission_denied", onRetry: noop }));
    for (const device of ["On a computer", "iPhone or iPad (Safari)", "Android (Chrome)"]) expect(denied).toContain(device);
    expect(html(createElement(MicrophoneState, { kind: "no_microphone", onRetry: noop }))).toContain("No microphone found");
  });

  it("finishing under a minute is 'very early'", () => {
    expect(isEarlyFinish(59_000, 120)).toBe(true);
    expect(isEarlyFinish(60_000, 120)).toBe(false);
  });
});

describe("retry goal hand-off (mock mode)", () => {
  it("links: the practice page carries the retried attempt; Finish goes to Scoring… with it", () => {
    expect(practiceHref(task.id, { mock: true, retry: "A2-b1-all-three", run: 1 })).toBe(
      "/practice/speaking/b2-part2-advice-from-someone?mock=1&retry=A2-b1-all-three&run=1",
    );
    expect(practiceHref(task.id, { retry: "abc" })).toBe("/practice/speaking/b2-part2-advice-from-someone?retry=abc");
    expect(mockScoringHref({ anchor: "A2-b1-all-three", run: 1 })).toBe("/result?state=scoring&next=1&from=A2-b1-all-three&fromRun=1");
    expect(mockScoringHref(null)).toBe("/result?state=scoring&next=1");
  });

  it("Scoring… shows the same goal, then opens the retry result, which says 'Goal met' or 'Not yet'", () => {
    const query = { state: "scoring", next: "1", from: "A2-b1-all-three", fromRun: "1" };
    const selection = selectMock(query);
    const state = resultPageState(mockResultSource(selection, task, config));
    if (state.kind !== "scoring") throw new Error(state.kind);
    expect(state.goal).toBe(goal!.objective);
    expect(html(createElement(ScoringResult, { state, flags: FEATURE_FLAGS }))).toContain("Your goal:");
    expect(mockResultHref(selection)).toBe("/result?state=retry&from=A2-b1-all-three&fromRun=1");
    expect(mockResultHref(selectMock({ state: "scoring", next: "1" }))).toBe("/result?anchor=A2-b1-all-three");

    const met = resultPageState(mockResultSource(selectMock({ state: "retry", from: "A2-b1-all-three", fromRun: "1" }), task, config));
    const notYet = resultPageState(mockResultSource(selectMock({ state: "retry", from: "A3-b2-q3-missing", fromRun: "1" }), task, config));
    if (met.kind !== "scored" || notYet.kind !== "scored") throw new Error("expected scored");
    expect(GOAL_LABEL[met.view.retry!.goal!]).toBe("Goal met");
    expect(GOAL_LABEL[notYet.view.retry!.goal!]).toBe("Not yet");
    expect(notYet.view.retry!.goalText).toBe(mockRetryAttempt({ anchor: "A3-b2-q3-missing", run: 1 }, task).evaluation!.result.retry_focus[0].objective);
  });

  it("a first attempt's Scoring… has no goal", () => {
    const state = resultPageState(mockResultSource(selectMock({ state: "scoring" }), task, config));
    expect(state).toMatchObject({ kind: "scoring", goal: null });
  });
});

describe("retry goal loading", () => {
  it("the brief offers no Start preparation (no black button) while a retry loads its goal", async () => {
    const { BriefCard, RetryGoalLoading } = await import("./screens");
    const task = toPublicTask(getSpeakingTask("b2-part2-advice-from-someone")!);
    const html = renderToStaticMarkup(createElement(BriefCard, { task, goal: null, onStart: () => {}, microphone: createElement(RetryGoalLoading) }));
    expect(html).toContain("Loading your goal");
    expect(html).toContain('role="status"');
    expect(html).not.toContain("Start preparation");
    expect(html.match(/class="[^"]*\bbg-primary text-on-primary\b/g) ?? []).toHaveLength(0);
    expect(html).not.toMatch(/text-\[(\d|10)(\.\d+)?px\]|text-xs\b/);
  });
});
