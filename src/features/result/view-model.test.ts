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
    expect(view.target.above).toEqual({ next: "Band 5 · Above B2" });
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

describe("quote labels come only from the evaluator's lists", () => {
  it("biggest fix: an error keeps 'You said / Try instead'; a listed strength is 'Your best sentence / Next step'", () => {
    expect(scored({ anchor: "A2-b1-all-three", run: "1" }).fix).toMatchObject({ quoteLabel: "You said", adviceLabel: "Try instead" });
    const a4 = scored({ anchor: "A4-b2-all-three", run: "1" }).fix;
    expect(a4).toMatchObject({ quoteLabel: "Your best sentence", adviceLabel: "Next step" });
    expect(a4.quote).toBe(LIVE_36_FLASH_FIXTURES["A4-b2-all-three"].runs[0].evaluation.result.assessment.strengths.find((x) => x.feature === "grammar")!.quote);
  });

  it("biggest fix: not an error and no listed strength → their words as 'You said', never 'best'", () => {
    // A2 run 3: grammar is the fix but its errors are typed vocabulary and it has no strengths.
    expect(scored({ anchor: "A2-b1-all-three", run: "3" }).fix).toMatchObject({ quoteLabel: "You said", adviceLabel: "Next step" });
  });

  it("skills: every label matches a listed strength or error of that skill; unlisted quotes stay unlabelled", () => {
    let labelled = 0;
    for (const anchor of FIXTURE_ANCHORS) {
      LIVE_36_FLASH_FIXTURES[anchor].runs.forEach((run, i) => {
        const a = run.evaluation.result.assessment;
        for (const skill of scored({ anchor, run: String(i + 1) }).skills) {
          if (!skill.quoteLabel) continue;
          labelled++;
          const list = skill.quoteLabel === "What you did well" ? a.strengths.filter((x) => x.feature === skill.feature) : a.errors.filter((e) => e.type === skill.feature);
          const q = skill.quote!.toLowerCase();
          expect(list.some((x) => q.includes(x.quote.toLowerCase()) || x.quote.toLowerCase().includes(q)), `${anchor} ${i + 1} ${skill.feature}`).toBe(true);
        }
      });
    }
    expect(labelled).toBeGreaterThan(0);
    // A2 run 1 fluency has neither a strength nor an error listed: no label.
    expect(scored({ anchor: "A2-b1-all-three", run: "1" }).skills.find((x) => x.feature === "fluency")!.quoteLabel).toBeNull();
    expect(scored({ anchor: "A2-b1-all-three", run: "1" }).skills.find((x) => x.feature === "vocabulary")).toMatchObject({ quoteLabel: "To improve", quote: "my speaking became better" });
  });

  it("answered questions show no note; partly / not counted do", () => {
    const html = render(stateFor({ anchor: "A3-b2-q3-missing", run: "1" }));
    const notes = LIVE_36_FLASH_FIXTURES["A3-b2-q3-missing"].runs[0].evaluation.result.assessment.questions;
    expect(html).not.toContain(notes[0].note.replace(/'/g, "&#x27;"));
    expect(html).toContain(notes[2].note.replace(/'/g, "&#x27;"));
  });

  it("above the target: lime 'Above your target' and the next band, no 'band above'", () => {
    const html = render(stateFor({ anchor: "A4-b2-all-three" }));
    expect(html).toContain("Above your target");
    expect(html).toContain("Next: Band 5 · Above B2");
    expect(html).not.toMatch(/band above/);
    expect(scored({ anchor: "A5-above-b2" }).target.above).toEqual({ next: null });
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

describe("patterns in this answer", () => {
  it("A0-below-b1: at most 3, in the evaluator's order, each with its count and the first error's quote", () => {
    const view = scored({ anchor: "A0-below-b1", run: "1" });
    const a = LIVE_36_FLASH_FIXTURES["A0-below-b1"].runs[0].evaluation.result.assessment;
    expect(view.patterns).toHaveLength(3);
    view.patterns.forEach((p, i) => {
      expect(p.name).toBe(a.error_patterns[i].name);
      expect(p.count).toBe(a.errors.filter((e) => e.pattern === p.name).length);
      expect(p.quote).toBe(a.errors.find((e) => e.pattern === p.name)!.quote);
    });
    const html = render(stateFor({ anchor: "A0-below-b1" }));
    expect(html).toContain("Patterns in this answer");
    expect(html).toContain("2 times");
  });

  it("no patterns: the section is hidden", () => {
    expect(scored({ anchor: "A4-b2-all-three" }).patterns).toEqual([]);
    expect(render(stateFor({ anchor: "A4-b2-all-three" }))).not.toContain("Patterns in this answer");
  });
});
