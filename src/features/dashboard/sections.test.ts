import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ExamDateState } from "@/domain/exam-date";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const { ExamDate } = await import("./ExamDate");
const { ExamPartsCard, FindYourLevelCard, PractiseNextCard, ProgressPreviewCard, PREVIEW_PLACEHOLDER, PREVIEW_UNLOCK } = await import("./sections");

const BLACK = /class="[^"]*\bbg-primary text-on-primary\b/g;
const blacks = (markup: string) => (markup.match(BLACK) ?? []).length;
const TOO_SMALL = /text-\[(\d|10)(\.\d+)?px\]|text-xs\b/;
const html = (el: React.ReactElement) => renderToStaticMarkup(el);
/** The class list of the element whose text is exactly `text`. */
const classOf = (markup: string, text: string) => new RegExp(`class="([^"]*)"[^>]*>${text}<`).exec(markup)?.[1] ?? "";

const exam = (state: ExamDateState) => html(createElement(ExamDate, { state, today: "2026-11-07", max: "2028-11-06", variant: "card" }));

describe("exam date", () => {
  it("after Skip or Remove date: a small secondary 'Add exam date' where the countdown would be (not black)", () => {
    const markup = exam({ kind: "skipped" });
    expect(markup).toContain("Your exam");
    expect(markup).toContain("Not set");
    expect(markup).toContain("Add exam date");
    expect(classOf(markup, "Add exam date")).toContain("min-h-9");
    expect(classOf(markup, "Add exam date")).not.toContain("bg-primary");
    expect(markup).not.toContain('type="date"'); // the picker opens on tap
  });

  it("countdown: Edit has a 36 px tap area, like Save and Cancel", () => {
    const markup = exam({ kind: "countdown", date: "2026-11-30", days: 23, label: "in 23 days" });
    expect(markup).toContain("in 23 days");
    expect(classOf(markup, "Edit")).toContain("min-h-9");
  });

  it("the question: Save, and Skip with a 36 px tap area; no Remove date when there is nothing to remove", () => {
    for (const state of [{ kind: "ask" }, { kind: "ask_again", passed: "2026-11-01" }] as ExamDateState[]) {
      const markup = exam(state);
      expect(markup).toContain('type="date"');
      expect(classOf(markup, "Skip")).toContain("min-h-9");
      expect(markup).not.toContain("Remove date");
      expect(blacks(markup)).toBe(0);
      expect(markup).not.toMatch(TOO_SMALL);
    }
    expect(exam({ kind: "ask_again", passed: "2026-11-01" })).toContain("When is your next exam?");
  });
});

describe("exam date before the page is ready (server HTML, before hydration)", () => {
  it("every control is disabled, so nothing picked or tapped then can be lost", () => {
    const states: ExamDateState[] = [
      { kind: "ask" },
      { kind: "ask_again", passed: "2026-11-01" },
      { kind: "countdown", date: "2026-11-30", days: 23, label: "in 23 days" },
      { kind: "skipped" },
    ];
    for (const state of states) {
      const markup = exam(state);
      const controls = markup.match(/<(input|button)\b[^>]*>/g) ?? [];
      expect(controls.length).toBeGreaterThan(0);
      for (const control of controls) expect(control).toMatch(/\bdisabled=""/);
    }
  });
});

describe("Practise next", () => {
  it("shows the whole goal, never clamped, on every screen size", () => {
    const goal = "Try adding a third conditional sentence (for example, 'If I hadn't listened to him, I would have given up') to show even greater grammatical range when you tell the story.";
    const markup = html(createElement(PractiseNextCard, { next: { taskId: "b2-part2-advice-from-someone", title: "Advice from someone", partLabel: "Part 2", minutes: 3, reason: "Your goal isn't met yet", goal, href: "/x" } }));
    const shown = `Your goal: ${goal.replace(/'/g, "&#x27;")}`;
    expect(markup).toContain(shown);
    expect(markup).not.toContain("line-clamp");
    expect(classOf(markup, shown)).not.toMatch(/truncate|hidden/);
    expect(blacks(markup)).toBe(1);
  });
});

describe("welcome card", () => {
  it("first visit: 'Start your first practice'; with attempts not scored yet: 'Start practice', still one black button", () => {
    const first = html(createElement(FindYourLevelCard, { exam: null }));
    expect(first).toContain("Start your first practice");
    expect(first).toContain("Welcome to CEFRO");
    const back = html(createElement(FindYourLevelCard, { exam: null, hasAttempts: true }));
    expect(back).toContain(">Start practice<");
    expect(back).not.toContain("first practice");
    expect(back).toContain("Welcome back");
    expect(blacks(first)).toBe(1);
    expect(blacks(back)).toBe(1);
  });
});

describe("exam part tiles", () => {
  it("a part with no task says Coming soon and has no link; Part 2 keeps its link", () => {
    const markup = html(
      createElement(ExamPartsCard, {
        parts: [
          { part: "Part 1.1", name: "Personal questions", band: null, bandLabel: null, href: null },
          { part: "Part 2", name: "Long turn", band: null, bandLabel: null, href: "/practice#part-2" },
          { part: "Part 3", name: "Argument", band: null, bandLabel: null, href: null },
        ],
      }),
    );
    const tiles = markup.split('data-testid="part-tile"').slice(1);
    expect(tiles).toHaveLength(3);
    for (const i of [0, 2]) {
      expect(tiles[i]).toContain("Coming soon");
      expect(tiles[i]).not.toContain("<a ");
      expect(tiles[i]).not.toContain("Start");
    }
    expect(tiles[1]).toContain('href="/practice#part-2"');
    expect(tiles[1]).toContain(">Start<");
    expect(markup).not.toMatch(TOO_SMALL);
    expect(blacks(markup)).toBe(0);
  });
});

describe("empty Speaking progress (no scored answer yet)", () => {
  const stats = [
    { label: "Attempts this month", value: "0" },
    { label: "Parts practised", value: "0 of 4" },
    { label: "Practice time this month", value: "0 min" },
  ];
  const markup = html(createElement(ProgressPreviewCard, { preview: { targetLabel: "B2", stats } }));

  it("shows the card and the radar's skill names, with no level, no shape and nothing that reads as a result", () => {
    expect(markup).toContain("Speaking progress");
    expect(markup).toContain("· target B2");
    expect(markup).toContain(PREVIEW_UNLOCK);
    expect(markup).toContain(PREVIEW_PLACEHOLDER);
    for (const skill of ["Grammar", "Vocabulary", "Fluency", "Cohesion"]) expect(markup).toContain(skill);
    expect(markup).not.toContain("Pronunciation"); // not scored yet, so the empty radar does not promise it
    for (const s of stats) expect(markup).toContain(s.value);
    expect(markup).not.toContain('data-testid="current-level"');
    expect(markup).not.toContain("<polygon points=\"\" ");
    expect(markup).not.toMatch(/url\(#[^)]*\)"[^>]*stroke="var\(--color-accent\)"/); // no filled skill shape
    expect(markup).not.toContain(">Not assessed<");
  });

  it("has no black button (the page's one black button stays 'Start your first practice') and no text under 11 px", () => {
    expect(blacks(markup)).toBe(0);
    expect(markup).not.toMatch(TOO_SMALL);
  });
});
