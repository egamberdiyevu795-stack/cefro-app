import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DEMO_MODE_TEXT, DEMO_RESULT_TEXT, DemoLabel } from "@/components/ds";
import { getSpeakingTask } from "@/content/speaking";
import type { AttemptView } from "@/domain/speaking/attempt";
import { toPublicTask } from "@/domain/speaking/task";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { AttemptResult } from "./AttemptResult";
import { FIXTURE_ANCHORS, mockResultSource, mockRetryAttempt, RESULT_STATES, selectMock } from "./mock-data";
import { FailedResult, NotScoredResult, ScoredResult, ScoringResult } from "./sections";
import { resultPageState, type ResultPageState } from "./view-model";

// The real result page uses the App Router; a static render only needs a router object.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }) }));

/**
 * "Demo result. Your answer was not scored." marks every screen built from mock data, so a tester can't mistake a
 * saved demo score for their own. It must never appear on a real result.
 */
const speakingTask = getSpeakingTask("b2-part2-advice-from-someone")!;
const task = toPublicTask(speakingTask);
const config = getSpeakingRubric(speakingTask).config;
const bandLabels = config.bands.map(({ band, label }) => ({ band, label }));
const BLACK = /class="[^"]*\bbg-primary text-on-primary\b/g;
const SMALL = /text-\[(\d|10)(\.\d+)?px\]|text-xs\b/;
const LABEL = /data-testid="demo-label"/g;

/** The /result prototype's screens, rendered as the page renders them (with or without `demo`). */
function renderMock(state: ResultPageState, demo: boolean): string {
  const noop = () => undefined;
  switch (state.kind) {
    case "scored":
      return renderToStaticMarkup(createElement(ScoredResult, { view: state.view, task, retryHref: noop, demo }));
    case "scoring":
      return renderToStaticMarkup(createElement(ScoringResult, { state, demo }));
    case "not_scored":
      return renderToStaticMarkup(createElement(NotScoredResult, { state, recordHref: noop, demo }));
    default:
      return renderToStaticMarkup(createElement(FailedResult, { state, recordHref: noop, demo }));
  }
}

const mockCases: Array<[string, Record<string, string>]> = [
  ...FIXTURE_ANCHORS.map((anchor) => [anchor, { anchor }] as [string, Record<string, string>]),
  ...RESULT_STATES.map((state) => [`state=${state}`, { state }] as [string, Record<string, string>]),
];

describe("demo label on mock results (/result prototype)", () => {
  it.each(mockCases)("%s: the label once, at the top of the result card; no extra black button; no text under 11 px", (_name, query) => {
    const state = resultPageState(mockResultSource(selectMock(query), task, config));
    const html = renderMock(state, true);
    expect(html.match(LABEL)).toHaveLength(1);
    expect(html).toContain(DEMO_RESULT_TEXT);
    expect(DEMO_RESULT_TEXT).toBe("Demo result. Your answer was not scored.");
    // First thing inside the result card: before "Your result · …" and the heading.
    const card = html.slice(html.indexOf('aria-labelledby="result-title"'));
    expect(card.indexOf("demo-label")).toBeGreaterThan(-1);
    expect(card.indexOf("demo-label")).toBeLessThan(card.indexOf("Your result ·"));
    // A note, not a button: same number of black buttons as without it.
    expect((html.match(BLACK) ?? []).length).toBe((renderMock(state, false).match(BLACK) ?? []).length);
    expect(html).toMatch(/<p role="note" data-testid="demo-label" class="[^"]*\btext-label\b[^"]*\btext-fg\b[^"]*\bbg-well\b|<p role="note" data-testid="demo-label" class="[^"]*\bbg-well\b[^"]*\btext-label\b/);
    expect(html).not.toMatch(SMALL);
  });

  it("the prototype page passes `demo` to every result screen it renders", () => {
    const page = fs.readFileSync(path.join(process.cwd(), "src", "app", "result", "page.tsx"), "utf8");
    for (const screen of ["ScoredResult", "ScoringResult", "NotScoredResult", "FailedResult"]) {
      expect(page, screen).toMatch(new RegExp(`<${screen}\\b[^>]*\\bdemo\\b[^>]*/>`));
    }
  });
});

describe("no demo label on real results", () => {
  const stored = (anchor: string, overrides: Partial<AttemptView> = {}): AttemptView => ({ ...mockRetryAttempt({ anchor, run: 1 }, task), ...overrides });
  const realCases: Array<[string, AttemptView, AttemptView | null]> = [
    ["scored", stored("A4-b2-all-three"), null],
    ["retry with its previous attempt", stored("A3-b2-q3-missing", { previousAttemptId: "prev" }), stored("A2-b1-all-three", { id: "prev" })],
    ["scoring", stored("A2-b1-all-three", { status: "evaluating", evaluation: null }), null],
    ["too short / no speech", stored("A2-b1-all-three", { status: "failed", evaluation: null, transcript: null, failure: { stage: "transcription", code: "transcription_empty" } }), null],
    ["failed", stored("A2-b1-all-three", { status: "failed", evaluation: null, failure: { stage: "evaluation", code: "evaluation_failed" } }), null],
  ];

  it.each(realCases)("%s: the real result page shows no demo label", (_name, initial, previous) => {
    const html = renderToStaticMarkup(createElement(AttemptResult, { initial, previous, task, bandLabels }));
    expect(html).toContain('aria-labelledby="result-title"'); // it really rendered a result screen
    expect(html).not.toMatch(LABEL);
    expect(html).not.toContain(DEMO_RESULT_TEXT);
  });

  it("the result screens default to no label, and the real page never sets `demo`", () => {
    const state = resultPageState(mockResultSource(selectMock({}), task, config));
    expect(state.kind).toBe("scored");
    if (state.kind === "scored") expect(renderToStaticMarkup(createElement(ScoredResult, { view: state.view, task }))).not.toMatch(LABEL);
    const real = fs.readFileSync(path.join(process.cwd(), "src", "features", "result", "AttemptResult.tsx"), "utf8");
    expect(real).not.toMatch(/\bdemo\b|DemoLabel/);
  });
});

describe("demo label wording", () => {
  it("results say 'Demo result'; the practice page in mock mode says 'Demo mode'", () => {
    expect(renderToStaticMarkup(createElement(DemoLabel))).toContain("Demo result. Your answer was not scored.");
    const mode = renderToStaticMarkup(createElement(DemoLabel, { variant: "mode" }));
    expect(DEMO_MODE_TEXT).toBe("Demo mode. Your answer won't be scored.");
    expect(mode).toContain("Demo mode. Your answer won&#x27;t be scored.");
    expect(mode).not.toContain("Demo result");
    for (const html of [mode, renderToStaticMarkup(createElement(DemoLabel))]) {
      expect(html).toMatch(/role="note"/);
      expect(html).not.toMatch(SMALL);
      expect(html).not.toMatch(BLACK);
    }
    // The practice page uses the mode wording (only in mock mode); the result prototype the result wording.
    const practice = fs.readFileSync(path.join(process.cwd(), "src", "features", "speaking-practice", "components", "PracticeExperience.tsx"), "utf8");
    expect(practice).toMatch(/\{isMock && <DemoLabel variant="mode"/);
    expect(practice.match(/<DemoLabel/g)).toHaveLength(1);
  });
});
