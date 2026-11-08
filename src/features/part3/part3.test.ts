import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/*
 * Part 3 (mock mode only): content, links, the result view model, every screen's markup (one black button at most,
 * no text under 11 px, only ?mock=1 links) and the pages, rendered with the database, cookies and identity wired to
 * throw. Without ?mock=1 every Part 3 page is a 404, and the live switch stays off.
 */

const { touched, forbidden } = vi.hoisted(() => {
  const touched = { db: 0, cookies: 0, identity: 0 };
  const forbidden = (what: "db" | "cookies" | "identity") => () => {
    touched[what] += 1;
    throw new Error(`mock mode touched ${what}`);
  };
  return { touched, forbidden };
});
vi.mock("next/headers", () => ({ cookies: forbidden("cookies"), headers: async () => new Headers() }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, prefetch: () => {} }),
  usePathname: () => "/practice/part3",
}));
vi.mock("@/server/db/client", () => ({ getDb: forbidden("db"), openDatabase: forbidden("db"), createDatabase: forbidden("db") }));
vi.mock("@/server/identity/current-user", () => ({ findCurrentUserId: forbidden("identity"), getCurrentUserId: forbidden("identity"), isSignedIn: forbidden("identity") }));

import Part3ListPage from "@/app/practice/part3/page";
import Part3PracticePage from "@/app/practice/part3/[taskId]/page";
import Part3ResultPage from "@/app/result/part3/page";
import { PART_LIVE } from "@/config/features";
import { examStatus } from "@/features/entry/content";
import { listArgumentTasks } from "@/content/speaking/part3";
import { PART3_INTRO_AUDIO_FILES, PART3_INTRO_VOICE, part3Intro, part3IntroText } from "@/content/speaking/c1/part3-intro-audio";
import { PART1_AUDIO_FILES } from "@/content/speaking/part1/question-audio";
import part1AudioManifest from "@/content/speaking/part1/question-audio.json";
import { listSpeakingTasks } from "@/content/speaking";
import { argumentTaskProblems, toPublicArgumentTask, type PointId } from "@/domain/speaking/argument-task";
import { part3DemoEvaluation, part3DemoSpec, part3DemoTranscriptFor } from "@/server/demo/part3-demo";
import { decodePoints, encodePoints, nextPart3Key, parsePart3Key, part3PracticeHref, part3ResultHref, previousPart3Key } from "./links";
import { Part3BriefCard, Part3IntroCard, Part3PreparationCard, Part3RecordingCard, StatementCard, canToggle, choiceSummary } from "./screens";
import { Part3ScoredResult } from "./result-sections";
import { buildPart3View, markCopied } from "./view-model";
import { PracticeLayout } from "@/features/speaking-practice/components/screens";

const BLACK = /<(a|button)\b[^>]*class="[^"]*\bbg-primary text-on-primary\b/g;
const blacks = (markup: string) => (markup.match(BLACK) ?? []).length;
const SMALL_TEXT = /text-\[(\d|10)(\.\d+)?px\]|text-xs\b/;
const props = (query: Record<string, string>, params: Record<string, string> = {}) => ({ params: Promise.resolve(params), searchParams: Promise.resolve(query) }) as never;
const html = async (el: unknown) => renderToStaticMarkup((await el) as React.ReactElement);
const internalLinks = (markup: string) => [...markup.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1].replaceAll("&amp;", "&"));
const noop = () => undefined;
const CARS = "c1-part3-cars-in-city-centres";

describe("Part 3 content", () => {
  it("three v1 topics (plan decision 9), each with exactly F1–F3 and A1–A3, 1 min + 2 min, C1", () => {
    expect(listArgumentTasks().map((t) => t.statement)).toEqual([
      "Cities should ban private cars from their centres.",
      "Children under 14 should not be allowed to own a smartphone.",
      "Governments should put a special tax on sugary drinks and fast food.",
    ]);
    for (const task of listArgumentTasks()) expect(argumentTaskProblems(task)).toEqual([]);
  });

  it("our own content: not the official sample's topic, none of the topics to avoid", () => {
    const text = JSON.stringify(listArgumentTasks()).toLowerCase();
    for (const word of ["gun", "weapon", "religion", "party", "crime", "citizens should be allowed"]) expect(text).not.toContain(word);
  });

  it("evaluator guidance never reaches the browser", () => {
    for (const task of listArgumentTasks()) expect(toPublicArgumentTask(task)).not.toHaveProperty("evaluatorGuidance");
  });

  it("Part 3 topics are not in the Part 2 registry the real practice flow and API read", () => {
    const ids = new Set(listSpeakingTasks().map((t) => t.id));
    for (const task of listArgumentTasks()) expect(ids.has(task.id)).toBe(false);
  });

  it("the live switch stays off: home and dashboard keep 'Coming soon'", () => {
    expect(PART_LIVE["3"]).toBe(false);
    const status = examStatus(PART_LIVE);
    expect(status.kind).toBe("list");
    if (status.kind === "list") expect(status.rows.find((r) => r.label.startsWith("Part 3"))).toMatchObject({ open: false, status: "Coming soon" });
  });
});

describe("links and demo keys", () => {
  it("encodes points in list order and refuses anything else", () => {
    expect(encodePoints(["A2", "F1", "A1", "F2"])).toBe("F1F2A1A2");
    expect(decodePoints("F1F2A1A2")).toEqual(["F1", "F2", "A1", "A2"]);
    for (const bad of ["F1F1", "A1F1", "F4", "X1"]) expect(decodePoints(bad)).toBeNull();
  });

  it("a key chains attempts; a retry is the key without its last list", () => {
    const first = nextPart3Key(CARS, ["F1", "F2", "A1", "A2"], null);
    expect(first).toBe(`p3.${CARS}.F1F2A1A2`);
    const retry = nextPart3Key(CARS, ["F1", "A1", "F3", "A3"], first);
    expect(retry).toBe(`p3.${CARS}.F1F2A1A2.F1F3A1A3`);
    expect(previousPart3Key(retry)).toBe(first);
    expect(parsePart3Key("p3.x.F1.F1.F1.F1.F1")).toBeNull();
    expect(nextPart3Key(CARS, ["F1"], `p3.other-task.F1`)).toBe(`p3.${CARS}.F1`);
  });

  it("every Part 3 link keeps ?mock=1", () => {
    for (const href of [part3PracticeHref(CARS), part3PracticeHref(CARS, { retry: "p3.x.F1" }), part3ResultHref("p3.x.F1"), part3ResultHref("p3.x.F1", { scoring: true })]) {
      expect(new URL(href, "http://x").searchParams.get("mock")).toBe("1");
    }
  });

  it("at most two points per side can be ticked", () => {
    expect(canToggle(["F1", "F2"], "F3")).toBe(false);
    expect(canToggle(["F1", "F2"], "F1")).toBe(true);
    expect(canToggle(["F1", "F2"], "A1")).toBe(true);
    expect(choiceSummary(["F1", "A3"] as PointId[])).toBe("FOR 1 of 2 · AGAINST 1 of 2");
  });
});

describe("result view model", () => {
  it("marks the runs copied from the list in the transcript", () => {
    const pieces = markCopied("So, I think, cleaner air and less noise is good.", ["cleaner air and less noise is"]);
    expect(pieces).toEqual([
      { text: "So, I think, ", copied: false },
      { text: "cleaner air and less noise is", copied: true },
      { text: " good.", copied: false },
    ]);
  });

  it("the first demo answer: rebutted AGAINST points, the rebuttal fix, target text", async () => {
    const key = `p3.${CARS}.F1F2A1A2`;
    const spec = part3DemoSpec(key)!;
    const result = (await part3DemoEvaluation(key))!.result;
    const view = buildPart3View(result, { task: spec.task, transcript: part3DemoTranscriptFor(spec), durationMs: 90_000, bandLabels: [{ band: 5, label: "C1" }], previous: null, isDevelopmentProvider: true });
    expect(view.headline).toBe("Part 3 · Band 4 · Higher B2");
    expect(view.targetText).toBe("Target: band 5 (C1). You are 1 band below it.");
    expect(view.sides[1].points.find((p) => p.id === "A1")).toMatchObject({ verdictLabel: "Stated, then argued against", chosen: true });
    expect(view.fix.tryInstead).toBe("Before you argue against a point, give one real reason that supports it.");
    expect(view.chooseTwo).toBe(false);
    expect(view.dependence.label).toBe("In your own words");
  });
});

describe("screens", () => {
  const task = toPublicArgumentTask(listArgumentTasks()[0]);
  const goal = { objective: "Before you argue against a point, give one real reason that supports it. Support A1 first.", check: "check" };
  const screen = (step: React.ReactElement, chosen: PointId[] = ["F1", "A1"], toggle = false) =>
    renderToStaticMarkup(createElement(PracticeLayout, { task: createElement(StatementCard, { task, chosen, onToggle: toggle ? noop : undefined }), step }));
  const SCREENS: [string, string, number][] = [
    ["brief", screen(createElement(Part3BriefCard, { task, goal: null, onStart: noop })), 1],
    ["brief (retry)", screen(createElement(Part3BriefCard, { task, goal, onStart: noop })), 1],
    ["introduction (retry)", screen(createElement(Part3IntroCard, { text: part3IntroText(task), goal })), 0],
    ["preparation", screen(createElement(Part3PreparationCard, { totalMs: 60_000, remainingMs: 40_000, chosen: ["F1", "A1"], goal, onSkip: noop }), ["F1", "A1"], true), 0],
    ["recording", screen(createElement(Part3RecordingCard, { totalMs: 120_000, remainingMs: 90_000, level: 0.4, chosen: ["F1", "A1"], goal, earlyWarning: false, onFinish: noop, onKeepSpeaking: noop, onFinishAnyway: noop })), 1],
    ["recording, early warning", screen(createElement(Part3RecordingCard, { totalMs: 120_000, remainingMs: 100_000, level: 0.4, chosen: ["F1", "A1"], goal, earlyWarning: true, onFinish: noop, onKeepSpeaking: noop, onFinishAnyway: noop })), 1],
  ];

  it.each(SCREENS)("%s: the screen has the right black buttons, no text under 11 px, the statement and all six points", (_name, markup, expected) => {
    expect(blacks(markup)).toBe(expected);
    expect(markup).not.toMatch(SMALL_TEXT);
    expect(markup).toContain(task.statement);
    for (const point of task.points) expect(markup).toContain(point.text);
  });

  it("preparation: checkboxes, two per side, the third disabled", () => {
    const markup = screen(createElement(Part3PreparationCard, { totalMs: 60_000, remainingMs: 40_000, chosen: ["F1", "F2"], goal: null, onSkip: noop }), ["F1", "F2"], true);
    expect((markup.match(/type="checkbox"/g) ?? []).length).toBe(6);
    expect(markup).toMatch(/<input type="checkbox" disabled=""/);
    expect(markup).toContain("2 of 2 chosen");
  });

  it("the goal is on every retry screen", () => {
    for (const [name, markup] of SCREENS.slice(1)) expect(markup, name).toContain("Your goal:");
  });

  it("the result: one black button, no small text, the points card and the transcript", async () => {
    const key = `p3.${CARS}.F1F2A1A2.F1F2A1A2`;
    const spec = part3DemoSpec(key)!;
    const result = (await part3DemoEvaluation(key))!.result;
    const previous = (await part3DemoEvaluation(previousPart3Key(key)!))!.result;
    const view = buildPart3View(result, { task: spec.task, transcript: part3DemoTranscriptFor(spec), durationMs: 90_000, bandLabels: [{ band: 5, label: "C1" }], previous, isDevelopmentProvider: true });
    const markup = renderToStaticMarkup(createElement(Part3ScoredResult, { view, retryHref: part3PracticeHref(CARS, { retry: key }), demo: true }));
    expect(blacks(markup)).toBe(1);
    expect(markup).not.toMatch(SMALL_TEXT);
    expect(markup).toContain("Band 4 → 5");
    expect(markup).toContain("Goal met");
    expect(markup).toContain("Demo result. Your answer was not scored.");
  });
});

describe("pages", () => {
  it("without ?mock=1 every Part 3 page is a 404", async () => {
    await expect(html(Part3ListPage(props({})))).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK;404|NEXT_NOT_FOUND/);
    await expect(html(Part3PracticePage(props({}, { taskId: CARS })))).rejects.toThrow(/404|NOT_FOUND/);
    await expect(html(Part3ResultPage(props({ demo: `p3.${CARS}.F1F2A1A2` })))).rejects.toThrow(/404|NOT_FOUND/);
  });

  it("unknown topic or demo key: 404", async () => {
    await expect(html(Part3PracticePage(props({ mock: "1" }, { taskId: "nope" })))).rejects.toThrow(/404|NOT_FOUND/);
    await expect(html(Part3ResultPage(props({ mock: "1", demo: "p3.nope.F1" })))).rejects.toThrow(/404|NOT_FOUND/);
  });

  const pages: [string, () => Promise<unknown>, number][] = [
    ["topic list", () => Part3ListPage(props({ mock: "1" })), 0],
    ["practice", () => Part3PracticePage(props({ mock: "1" }, { taskId: CARS })), 1],
    ["practice retry", () => Part3PracticePage(props({ mock: "1", retry: `p3.${CARS}.F1F2A1A2` }, { taskId: CARS })), 1],
    ["scoring", () => Part3ResultPage(props({ mock: "1", demo: `p3.${CARS}.F1F2A1A2`, state: "scoring", next: "1" })), 0],
    ["result", () => Part3ResultPage(props({ mock: "1", demo: `p3.${CARS}.F1F2A1A2` })), 1],
  ];
  it.each(pages)("%s in mock mode: demo label, only ?mock=1 links, black buttons, no small text, nothing real touched", async (_name, page, expected) => {
    const markup = await html(page());
    const main = markup.slice(markup.indexOf('<main id="main"'), markup.indexOf("</main>"));
    expect(markup).toMatch(/Demo (mode|result)\./);
    for (const href of internalLinks(markup)) expect(new URL(href, "http://x").searchParams.get("mock"), href).toBe("1");
    expect(blacks(main)).toBe(expected);
    expect(markup).not.toMatch(SMALL_TEXT);
    expect(touched).toEqual({ db: 0, cookies: 0, identity: 0 });
  });

  it("a retry opens with its goal and the points of the attempt it retries", async () => {
    const markup = await html(Part3PracticePage(props({ mock: "1", retry: `p3.${CARS}.F1F2A1A2` }, { taskId: CARS })));
    expect(markup).toContain("Your goal:");
    expect(markup).toContain("Speaking · Part 3 · Retry");
  });
});

describe("mock-only files", () => {
  it("the Part 3 mock rules are imported only by the Part 3 mock evaluator", () => {
    const files: string[] = [];
    const walk = (dir: string) => readdirSync(dir).forEach((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : files.push(join(dir, f))));
    walk("src");
    const importers = files.filter((f) => !f.endsWith(".test.ts") && /mock-argument-rules/.test(readFileSync(f, "utf8")) && !f.endsWith("mock-argument-rules.ts"));
    expect(importers).toEqual([join("src", "server", "evaluation", "mock-argument-model.ts")]);
  });
});

describe("spoken introduction (exam style, same offline voice as Part 1)", () => {
  it.each(listArgumentTasks().map((t) => [t.id, t] as const))("%s: the introduction reads the statement and the timings and ends with the chime sample", (_id, task) => {
    const intro = part3Intro(task);
    expect(intro.text).toContain(task.statement);
    expect(intro.text).toMatch(/one minute to prepare/);
    expect(intro.text).toMatch(/two minutes to speak/);
    expect(intro.text).toMatch(/Start speaking when you hear this sound\.$/);
    expect(intro.audio).toBe(`/audio/speaking/part3/${task.id}/v${task.version}/intro.wav`);
  });

  it("every introduction's audio was made from its current text (changing a statement fails until the audio is remade)", () => {
    const expected = listArgumentTasks().map((t) => part3Intro(t)).map(({ audio, text }) => ({ path: audio, text }));
    expect(PART3_INTRO_AUDIO_FILES).toEqual(expected);
  });

  it("uses exactly the Part 1 voice and settings", () => {
    expect(PART3_INTRO_VOICE).toEqual(part1AudioManifest.voice);
    expect(PART1_AUDIO_FILES.length).toBeGreaterThan(0);
  });

  it.each(PART3_INTRO_AUDIO_FILES.map((f) => [f.path] as const))("%s exists as a WAV file in /public", (file) => {
    const full = join(process.cwd(), "public", file);
    expect(statSync(full).size).toBeGreaterThan(10_000);
    expect(readFileSync(full).subarray(0, 4).toString("ascii")).toBe("RIFF");
  });

  it("the introduction screen has its text, the goal on a retry, and no black button", () => {
    const task = listArgumentTasks()[0];
    const markup = renderToStaticMarkup(createElement(Part3IntroCard, { text: part3IntroText(task), goal: null }));
    expect(markup).toContain(task.statement);
    expect(markup).toContain("Listen");
    expect(blacks(markup)).toBe(0);
  });
});
