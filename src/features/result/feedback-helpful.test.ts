import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getSpeakingTask } from "@/content/speaking";
import { toPublicTask } from "@/domain/speaking/task";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { FeedbackHelpful, HELPFUL_QUESTION } from "./FeedbackHelpful";
import { mockResultSource, selectMock } from "./mock-data";
import { ScoredResult } from "./sections";
import { resultPageState } from "./view-model";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }) }));

/*
 * "Was this feedback helpful?" on the result page: under the Biggest fix, two quiet pills (never black), disabled in
 * the server HTML until the page's scripts run, a stored answer shown instead of the question, never on the teacher's
 * view, and no text under 11 px. (Saving is checked in app/api/feedback-helpful.test.ts and the browser test.)
 */
const speakingTask = getSpeakingTask("b2-part2-advice-from-someone")!;
const task = toPublicTask(speakingTask);
const config = getSpeakingRubric(speakingTask).config;
const view = (() => {
  const state = resultPageState(mockResultSource(selectMock({}), task, config));
  if (state.kind !== "scored") throw new Error("expected a scored demo result");
  return state.view;
})();
const BLACK = /class="[^"]*\bbg-primary text-on-primary\b/g;
const TINY = /text-\[(\d|10)(\.\d+)?px\]|text-xs\b/;

describe("Was this feedback helpful?", () => {
  it("asks with two quiet Yes / No pills, disabled until the page is ready", () => {
    const html = renderToStaticMarkup(createElement(FeedbackHelpful, { target: { attemptId: "a", initial: null } }));
    expect(html).toContain(HELPFUL_QUESTION);
    expect(html).toMatch(/data-testid="feedback-helpful-yes"[^>]*>Yes</);
    expect(html).toMatch(/data-testid="feedback-helpful-no"[^>]*>No</);
    expect(html.match(/<button[^>]*disabled=""/g) ?? []).toHaveLength(2);
    expect(html.match(/class="[^"]*\bbg-well text-fg\b/g) ?? []).toHaveLength(2);
    expect(html).not.toMatch(BLACK);
    expect(html).toContain('role="status"');
    expect(html).not.toMatch(TINY);
  });

  it("shows the stored answer instead of the question on a later visit", () => {
    const yes = renderToStaticMarkup(createElement(FeedbackHelpful, { target: { attemptId: "a", initial: true } }));
    expect(yes).toContain("You found this feedback helpful.");
    expect(yes).not.toContain("<button");
    const no = renderToStaticMarkup(createElement(FeedbackHelpful, { target: { attemptId: "a", initial: false } }));
    expect(no).toContain("You told us this feedback wasn&#x27;t helpful.");
    expect(no).not.toContain(HELPFUL_QUESTION);
  });

  it("sits after the Biggest fix, and the page keeps exactly one black button", () => {
    const html = renderToStaticMarkup(createElement(ScoredResult, { view, task, helpful: { attemptId: "a", initial: null } }));
    expect(html.indexOf(HELPFUL_QUESTION)).toBeGreaterThan(html.indexOf("Biggest fix"));
    expect(html.match(BLACK) ?? []).toHaveLength(1);
    expect(html).not.toMatch(TINY);
  });

  it("is not on the teacher's view, nor when the page gives no target", () => {
    const teacher = renderToStaticMarkup(
      createElement(ScoredResult, { view, task, helpful: { attemptId: "a", initial: null }, teacher: { studentName: "Ali" } }),
    );
    expect(teacher).not.toContain(HELPFUL_QUESTION);
    expect(renderToStaticMarkup(createElement(ScoredResult, { view, task }))).not.toContain(HELPFUL_QUESTION);
  });
});
