import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cx, styles } from "@/components/ds";
import { getSpeakingTask } from "@/content/speaking";
import { FEATURE_FLAGS, allFlags, type FeatureFlags } from "@/config/features";
import { toPublicTask } from "@/domain/speaking/task";
import { demoResultHref, demoResultSource, demoResultSpec } from "@/server/demo/demo-data";
import { withMock } from "@/features/demo/demo-mode";
import { AutoAdvance } from "@/features/result/AutoAdvance";
import { DEFAULT_ANCHOR, FIXTURE_ANCHORS, RESULT_STATES, describeMock, mockResultHref, mockResultSource, selectMock, shownAttempt, type MockSelection } from "@/features/result/mock-data";
import { FailedResult, NotScoredResult, ScoredResult, ScoringResult } from "@/features/result/sections";
import { AppShell } from "@/features/shell/AppShell";
import { practiceHref } from "@/features/speaking-practice/lib/practice-flow";
import { resultPageState } from "@/features/result/view-model";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";

export const metadata: Metadata = { title: "Your result" };

/*
 * Design prototype of the result page. Mock data only: saved live evaluator outputs (test/fixtures/live-3.6-flash,
 * gemini-3.6-flash, not the production model), passed through the same view model real attempts will use
 * (features/result/view-model.ts). No provider is called.
 *
 * Switches: ?anchor=<fixture id> (&run=1..3), ?state=scored|scoring|too-short|no-speech|retry, ?flags=off,
 * &from=<fixture id>&fromRun=1..3 (the attempt a retry comes from), &next=1 ("Scoring…" opens the result by itself).
 * These show "Advice from someone", the task of the saved runs.
 *
 * ?demo=<demo key> (mock mode's demo results, server/demo/demo-data.ts): a demo attempt's result, or the result of
 * a mock practice, for ITS OWN task, produced by the mock evaluator. &state=scoring&next=1: its "Scoring…" first.
 *
 * This page is always mock data, with or without ?mock=1, and every link on it keeps ?mock=1 (mock mode), so the loop
 * can be clicked through without API keys or a database: "Retry with this goal" opens the practice page's mock mode
 * with this attempt (a saved run) as the one being retried; the navigation and "Dashboard" open the demo dashboard.
 */
export default async function ResultPage(props: PageProps<"/result">) {
  const query = await props.searchParams;
  const flags: FeatureFlags = query.flags === "off" ? allFlags(false) : FEATURE_FLAGS;
  const demoKey = typeof query.demo === "string" ? query.demo : null;
  if (demoKey) return demoResult({ demoKey, scoring: query.state === "scoring", next: query.next === "1", flags });
  const selection = selectMock(query);

  const speakingTask = getSpeakingTask("b2-part2-advice-from-someone");
  if (!speakingTask) notFound();
  const task = toPublicTask(speakingTask);
  const state = resultPageState(mockResultSource(selection, task, getSpeakingRubric(speakingTask).config));

  const shown = shownAttempt(selection);
  const retryHref = practiceHref(task.id, { mock: true, retry: shown.anchor, run: shown.run });
  const recordHref = practiceHref(task.id, { mock: true, ...(selection.from ? { retry: selection.from.anchor, run: selection.from.run } : {}) });

  return (
    <AppShell flags={flags} account="mock">
      {state.kind === "scored" ? (
        <ScoredResult view={state.view} task={task} flags={flags} retryHref={retryHref} demo />
      ) : state.kind === "scoring" ? (
        <ScoringResult state={state} flags={flags} demo />
      ) : state.kind === "not_scored" ? (
        <NotScoredResult state={state} flags={flags} recordHref={recordHref} demo />
      ) : (
        <FailedResult state={state} recordHref={recordHref} demo />
      )}
      {state.kind === "scoring" && selection.next && <AutoAdvance href={mockResultHref(selection)} />}
      <PrototypeSwitches selection={selection} />
    </AppShell>
  );
}

/** A demo result of mock mode, for its own task: a demo attempt, or the result of a mock practice. */
async function demoResult({ demoKey, scoring, next, flags }: { demoKey: string; scoring: boolean; next: boolean; flags: FeatureFlags }) {
  const spec = demoResultSpec(demoKey);
  const source = await demoResultSource(demoKey, { scoring });
  if (!spec || !source) notFound();
  const state = resultPageState(source);
  const task = toPublicTask(spec.task);
  // "Retry with this goal": a retry of this result. "Record again": the same practice again (a retry stays a retry).
  const retryHref = practiceHref(task.id, { mock: true, retry: demoKey });
  const recordHref = practiceHref(task.id, { mock: true, ...(spec.previous ? { retry: spec.previous } : {}) });
  return (
    <AppShell flags={flags} account="mock">
      {state.kind === "scored" ? (
        <ScoredResult view={state.view} task={task} flags={flags} retryHref={retryHref} demo />
      ) : state.kind === "scoring" ? (
        <ScoringResult state={state} flags={flags} demo />
      ) : state.kind === "not_scored" ? (
        <NotScoredResult state={state} flags={flags} recordHref={recordHref} demo />
      ) : (
        <FailedResult state={state} recordHref={recordHref} demo />
      )}
      {state.kind === "scoring" && next && <AutoAdvance href={demoResultHref(demoKey)} />}
    </AppShell>
  );
}

/** Quiet strip under the page: which mock is on screen, and links to the others. Not part of the design. */
function PrototypeSwitches({ selection }: { selection: MockSelection }) {
  const link = (params: Record<string, string>, label: string, active: boolean) => (
    <Link
      key={label}
      href={withMock(`/result?${new URLSearchParams(params)}`)}
      aria-current={active ? "page" : undefined}
      className={cx("inline-flex min-h-6 items-center text-caption", active ? "font-semibold text-fg" : "text-fg-muted underline hover:text-fg", styles.FOCUS_RING)}
    >
      {label}
    </Link>
  );
  return (
    <aside aria-label="Prototype data" className="mt-8 border-t border-line pt-3">
      <p className="text-caption text-fg-muted">
        Prototype · mock data: {describeMock(selection)}
      </p>
      <p className="mt-1 flex flex-wrap gap-x-3">
        {FIXTURE_ANCHORS.map((anchor) => link({ anchor }, anchor, selection.state === "scored" && selection.anchor === anchor))}
      </p>
      <p className="flex flex-wrap gap-x-3">
        {RESULT_STATES.filter((s) => s !== "scored").map((state) => link({ anchor: DEFAULT_ANCHOR, state }, state, selection.state === state))}
      </p>
    </aside>
  );
}
