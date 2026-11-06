import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ComingSoonToast, Sidebar, cx, styles } from "@/components/ds";
import { getSpeakingTask } from "@/content/speaking";
import { FEATURE_FLAGS, allFlags, type FeatureFlags } from "@/config/features";
import { toPublicTask } from "@/domain/speaking/task";
import { AccountMenu } from "@/features/dashboard/AccountMenu";
import { navItemsFor } from "@/features/dashboard/mock-data";
import { Wordmark } from "@/features/dashboard/sections";
import { DEFAULT_ANCHOR, FIXTURE_ANCHORS, RESULT_STATES, describeMock, mockResultSource, selectMock, type MockSelection } from "@/features/result/mock-data";
import { BackLink, FailedResult, NotScoredResult, ScoredResult, ScoringResult } from "@/features/result/sections";
import { resultPageState } from "@/features/result/view-model";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";

export const metadata: Metadata = { title: "Your result" };

/*
 * Design prototype of the result page. Mock data only: saved live evaluator outputs (test/fixtures/live-3.6-flash,
 * gemini-3.6-flash, not the production model), passed through the same view model real attempts will use
 * (features/result/view-model.ts). No provider is called.
 *
 * Switches: ?anchor=<fixture id> (&run=1..3), ?state=scored|scoring|too-short|no-speech|retry, ?flags=off.
 */
export default async function ResultPage(props: PageProps<"/result">) {
  const query = await props.searchParams;
  const selection = selectMock(query);
  const flags: FeatureFlags = query.flags === "off" ? allFlags(false) : FEATURE_FLAGS;

  const speakingTask = getSpeakingTask("b2-part2-advice-from-someone");
  if (!speakingTask) notFound();
  const task = toPublicTask(speakingTask);
  const state = resultPageState(mockResultSource(selection, task, getSpeakingRubric(speakingTask).config));

  return (
    <div className="min-h-dvh bg-page font-ui text-fg lg:p-6">
      <div className="mx-auto flex max-w-[1280px] px-4 pt-2 lg:gap-6 lg:rounded-shell lg:bg-shell lg:p-6 lg:pt-6 lg:shadow-card">
        <aside className="lg:flex lg:w-12 lg:shrink-0 lg:flex-col lg:items-center lg:gap-14">
          <Wordmark className="hidden lg:flex lg:h-12" />
          <Sidebar items={navItemsFor(flags)} activeHref="/" last={<AccountMenu />} />
        </aside>

        <div className="min-w-0 flex-1">
          <header className="mb-2 flex h-12 items-center justify-between lg:mb-3">
            <BackLink />
            <Wordmark className="flex lg:hidden" />
          </header>

          <main id="main" className="pb-28 lg:pb-0">
            {state.kind === "scored" ? (
              <ScoredResult view={state.view} task={task} flags={flags} />
            ) : state.kind === "scoring" ? (
              <ScoringResult state={state} flags={flags} />
            ) : state.kind === "not_scored" ? (
              <NotScoredResult state={state} flags={flags} />
            ) : (
              <FailedResult state={state} />
            )}
            <PrototypeSwitches selection={selection} />
          </main>
        </div>
      </div>
      <ComingSoonToast />
    </div>
  );
}

/** Quiet strip under the page: which mock is on screen, and links to the others. Not part of the design. */
function PrototypeSwitches({ selection }: { selection: MockSelection }) {
  const link = (params: Record<string, string>, label: string, active: boolean) => (
    <Link
      key={label}
      href={`/result?${new URLSearchParams(params)}`}
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
