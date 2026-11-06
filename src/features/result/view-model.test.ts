import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { allFlags, FEATURE_FLAGS, type FeatureFlags } from "@/config/features";
import { getSpeakingTask } from "@/content/speaking";
import { toPublicTask } from "@/domain/speaking/task";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { LIVE_36_FLASH_FIXTURES } from "../../../test/fixtures/live-3.6-flash";
import { FIXTURE_ANCHORS, mockResultSource, RESULT_STATES, selectMock } from "./mock-data";
import { NotScoredResult, ScoredResult, ScoringResult } from "./sections";
import { resultPageState, type ResultPageState, type ResultSource } from "./view-model";

const speakingTask = getSpeakingTask("b2-part2-advice-from-someone")!;
const task = toPublicTask(speakingTask);
const config = getSpeakingRubric(speakingTask).config;

function stateFor(query: Record<string, string>): ResultPageState {
  return resultPageState(mockResultSource(selectMock(query), task, config));
}

function scored(query: Record<string, string>) {
  const state = stateFor(query);
  if (state.kind !== "scored") throw new Error(`expected a scored result, got ${state.kind}`);
  return state.view;
}

function render(state: ResultPageState, flags: FeatureFlags = FEATURE_FLAGS): string {
  if (state.kind === "scored") return renderToStaticMarkup(createElement(ScoredResult, { view: state.view, task, flags }));
  if (state.kind === "scoring") return renderToStaticMarkup(createElement(ScoringResult, { state, flags }));
  if (state.kind === "not_scored") return renderToStaticMarkup(createElement(NotScoredResult, { state, flags }));
  throw new Error(state.kind);
}

describe("result page view model (saved live fixtures, no provider)", () => {
  it("builds every saved run of every anchor, with the band, label and target taken from the result", () => {
    for (const anchor of FIXTURE_ANCHORS) {
      LIVE_36_FLASH_FIXTURES[anchor].runs.forEach((run, i) => {
        const view = scored({ anchor, run: String(i + 1) });
        const s = run.evaluation.result.scoring;
        expect(view.headline).toBe(`Part 2 · Band ${s.band} · ${s.label}`);
        expect(view.target.band).toBe(s.target_band);
        expect(view.questions).toHaveLength(3);
        expect(view.skills.map((k) => k.name)).toEqual(["Grammar", "Vocabulary", "Pronunciation", "Fluency", "Cohesion"]);
      });
    }
  });

  it("A2: Part 2 · Band 2 · Higher B1, one band to the target, three questions answered, grammar fix with its correction", () => {
    const view = scored({ anchor: "A2-b1-all-three", run: "1" });
    expect(view.headline).toBe("Part 2 · Band 2 · Higher B1");
    expect(view.target.text).toBe("1 band to your target, Band 3 · Lower B2");
    expect(view.questions.map((q) => q.verdict)).toEqual(["answered", "answered", "answered"]);
    expect(view.fix).toMatchObject({ label: "Grammar · B1", quoteKind: "student", quote: "decide themselves", tryInstead: "decide for themselves" });
    expect(view.fix.goal).toMatch(/conditional/);
  });

  it("A1: missed questions are 'not counted' and the fix shows the question and its model answer", () => {
    const view = scored({ anchor: "A1-b1-only-q3" });
    expect(view.questions.map((q) => q.verdict)).toEqual(["not_counted", "not_counted", "answered"]);
    expect(view.fix.quoteKind).toBe("question");
    expect(view.fix.quote).toBe(task.prompts[0]);
    expect(view.fix.tryInstead).toBe(LIVE_36_FLASH_FIXTURES["A1-b1-only-q3"].runs[0].evaluation.result.assessment.questions[0].model_answer);
  });

  it("A0-below-b1 defaults to run 1 (band 2); runs 2 and 3 stay available, run 3 is band 0 and says why", () => {
    expect(selectMock({ anchor: "A0-below-b1" }).run).toBe(1);
    expect(scored({ anchor: "A0-below-b1" }).headline).toBe("Part 2 · Band 2 · Higher B1");
    expect(scored({ anchor: "A0-below-b1", run: "2" }).band).toBe(2);
    const view = scored({ anchor: "A0-below-b1", run: "3" });
    expect(view.band).toBe(0);
    expect(view.zeroReason).toBe("below_B1");
    expect(view.target.text).toBe("3 bands to your target, Band 3 · Lower B2");
  });

  it("memorised answer: the fix asks for own words, quoting how the answer began", () => {
    const view = scored({ anchor: "A0-memorized-off-topic" });
    expect(view.fix.label).toMatch(/^Own words/);
    expect(view.fix.quote).toBe("I would like to talk about my favourite hobby, which is playing football.");
  });

  it("pronunciation is 'Not assessed' (audio step off in every saved run) and the page says it wasn't checked", () => {
    const view = scored({ anchor: "A4-b2-all-three" });
    expect(view.skills.find((s) => s.feature === "pronunciation")).toMatchObject({ level: null, levelLabel: "Not assessed" });
    expect(view.provisional).toBe(true);
    expect(view.target.text).toBe("1 band above your target, Band 3 · Lower B2");
    expect(view.pronunciationNote).toBe("Pronunciation wasn't checked in this attempt.");
    const html = render(stateFor({ anchor: "A4-b2-all-three" }));
    expect(html).toContain("Pronunciation wasn&#x27;t checked in this attempt.");
    expect(html).not.toMatch(/provisional/i);
  });

  it("states: scoring while evaluating, couldn't score for too short (real scorer) and no speech", () => {
    expect(stateFor({ state: "scoring" })).toMatchObject({ kind: "scoring", step: "scoring" });
    expect(stateFor({ state: "too-short" })).toMatchObject({ kind: "not_scored", reason: "too_short", wordCount: 14 });
    expect(stateFor({ state: "no-speech" })).toMatchObject({ kind: "not_scored", reason: "no_speech", transcript: null });
  });

  it("retry: Band 2 → 3 and the grammar goal met, read from the judgements", () => {
    const view = scored({ state: "retry" });
    expect(view.retry).toMatchObject({ previousBand: 2, band: 3, goal: "met" });
    expect(view.skills.find((s) => s.feature === "grammar")).toMatchObject({ levelLabel: "B2", previousLevelLabel: "B1" });
  });

  it("needs no quality report, and shows no warning for its absence", () => {
    const source = mockResultSource(selectMock({}), task, config);
    expect(source.evaluation && "quality" in source.evaluation).toBe(false);
    const html = render(resultPageState(source));
    expect(html).not.toMatch(/quality|warning/i);
  });
});

describe("result page markup", () => {
  const BLACK = /class="[^"]*\bbg-primary text-on-primary\b/g;
  const all: Array<[string, Record<string, string>]> = [
    ...FIXTURE_ANCHORS.map((anchor) => [anchor, { anchor }] as [string, Record<string, string>]),
    ...RESULT_STATES.map((state) => [state, { state }] as [string, Record<string, string>]),
  ];

  it.each(all)("%s: at most one black button, no text under 11 px", (_name, query) => {
    for (const flags of [FEATURE_FLAGS, allFlags(false)]) {
      const html = render(stateFor(query), flags);
      expect((html.match(BLACK) ?? []).length).toBe(query.state === "scoring" ? 0 : 1);
      expect(html).not.toMatch(/text-\[(\d|10)(\.\d+)?px\]|text-xs\b/);
    }
  });

  it("flags off: no lesson link and no play button", () => {
    const html = render(stateFor({}), allFlags(false));
    expect(html).not.toContain("Lesson for this fix");
    expect(html).not.toContain("Play recording");
    expect(render(stateFor({}))).toContain("Lesson for this fix");
  });

  it("the page source shape is what the pipeline stores (type check)", () => {
    const source: ResultSource = mockResultSource(selectMock({ anchor: "A5-above-b2" }), task, config);
    expect(source.status).toBe("completed");
  });
});
