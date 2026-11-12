import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { getSpeakingTask } from "@/content/speaking";
import { toPublicTask } from "@/domain/speaking/task";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { AttemptResult } from "./AttemptResult";
import { mockResultSource, mockRetryAttempt, selectMock } from "./mock-data";
import { ScoredResult } from "./sections";
import { resultPageState } from "./view-model";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }) }));

/*
 * V1 decision Q6: the student's result shows "Your teacher: B2" next to CEFRO's level when the teacher has rated, and never
 * instead of it. Nothing is shown (not even an empty line) when the teacher has not rated.
 */
const speakingTask = getSpeakingTask("b2-part2-advice-from-someone")!;
const task = toPublicTask(speakingTask);
const config = getSpeakingRubric(speakingTask).config;
const bandLabels = config.bands.map(({ band, label }) => ({ band, label }));
const scored = () => {
  const state = resultPageState(mockResultSource(selectMock({}), task, config));
  if (state.kind !== "scored") throw new Error("expected a scored demo result");
  return state.view;
};

describe("Your teacher on the student's result", () => {
  it("shows the teacher's level beside CEFRO's band, which stays", () => {
    const view = scored();
    const html = renderToStaticMarkup(createElement(ScoredResult, { view, task, yourTeacher: "C1" }));
    expect(html).toContain('data-testid="your-teacher"');
    expect(html).toMatch(/CEFRO: [^<]+ · <\/span>Your teacher: <span[^>]*>C1<\/span>/);
    expect(html).toContain(`Band ${view.band}`); // CEFRO's own heading is still there
    expect(html).toContain(view.bandLabel);
    expect(html.match(/class="[^"]*\bbg-primary text-on-primary\b/g) ?? []).toHaveLength(1); // still one black button
    expect(html).not.toMatch(/text-\[(\d|10)(\.\d+)?px\]|text-xs\b/);
  });

  it("nothing when the teacher has not rated", () => {
    expect(renderToStaticMarkup(createElement(ScoredResult, { view: scored(), task }))).not.toContain("Your teacher");
  });

  it("the real result page component passes it through, and a teacher's page never shows it to the teacher", () => {
    const initial = mockRetryAttempt({ anchor: "A4-b2-all-three", run: 1 }, task);
    expect(renderToStaticMarkup(createElement(AttemptResult, { initial, previous: null, task, bandLabels, yourTeacher: "B2" }))).toContain("Your teacher: <span");
    expect(renderToStaticMarkup(createElement(AttemptResult, { initial, previous: null, task, bandLabels }))).not.toContain("Your teacher");
  });
});

describe("the demo switch teacher=1", () => {
  it("gives one band above the app's, capped at the top band, as a level", async () => {
    const { demoYourTeacher } = await import("@/server/demo/demo-mock");
    const labels = [{ band: 0, label: "Below B1" }, { band: 1, label: "Lower B1" }, { band: 2, label: "Higher B1" }, { band: 3, label: "Lower B2" }, { band: 4, label: "Higher B2" }, { band: 5, label: "Above B2" }];
    expect(demoYourTeacher(2, labels)).toBe("B2");
    expect(demoYourTeacher(1, labels)).toBe("B1");
    expect(demoYourTeacher(5, labels)).toBe("Above B2"); // capped: the top band itself
  });
});
