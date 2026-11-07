import type { Metadata } from "next";
import { connection } from "next/server";
import { ComingSoonButton, ComingSoonToast, DemoLabel, Icon, Sidebar, SearchSoon, TopBar, TopBarLink, cx, styles } from "@/components/ds";
import { FEATURE_FLAGS, allFlags, type FeatureFlags } from "@/config/features";
import { getSpeakingTask, listSpeakingTasks } from "@/content/speaking";
import { addDays, examDateState, MAX_DAYS_AHEAD, todayIn } from "@/domain/exam-date";
import type { FeatureLevel } from "@/domain/evaluation/multilevel/levels";
import type { HistoryAttempt } from "@/domain/speaking/history";
import { AccountTab } from "@/features/dashboard/AccountTab";
import { ExamDate } from "@/features/dashboard/ExamDate";
import { demoAttempts, demoExamDate, demoHref, demoTranscript } from "@/server/demo/demo-data";
import { isMockQuery, mockLink } from "@/features/demo/demo-mode";
import { navItemsFor } from "@/features/dashboard/mock-data";
import {
  dashboardFix,
  dashboardView,
  partTiles,
  practiseNext,
  progress,
  scoredAttempts,
  type TaskInfo,
} from "@/features/dashboard/progress";
import {
  BiggestFixCard,
  ExamPartsCard,
  FindYourLevelCard,
  PractiseNextCard,
  ProgressCard,
  RECENT_ATTEMPT_COUNT,
  RecentAttemptsCard,
  Wordmark,
  type ExamPartTileView,
} from "@/features/dashboard/sections";
import { toHistoryRows } from "@/features/history/view-model";
import { getAttemptViewForUser, listAttemptHistory } from "@/server/attempts/attempt-service";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { readExamDate } from "@/server/exam-date/exam-date-store";
import { findCurrentUserId } from "@/server/identity/current-user";

export const metadata: Metadata = { title: "Dashboard" };

/** The recommended first part: Part 2 shows the level fastest (one answer covers all five skills). */
const RECOMMENDED_TASK_ID = "b2-part2-advice-from-someone";

/*
 * The student's dashboard, from their own attempts (`listAttemptHistory`, the same owner rule as History and the
 * result page) and their exam date. Every number is computed by the pure functions in features/dashboard/progress.ts.
 *
 * Returning (at least one scored answer), desktop:
 *   row 1: [ Practise next             ] [ Exam date*      ]
 *   row 2: [ Speaking progress + radar ] [ Exam parts      ]
 *   row 3: [ Recent attempts           ] [ Biggest fix     ]
 * Returning, phone: practise next, exam date*, progress, biggest fix, radar, recent attempts, exam parts.
 * Attempts, none scored yet (still scoring, failed, too short): [ Find your level ("Start practice"), exam date* ],
 *   [ Recent attempts ], [ Exam parts ]. No level, skills or biggest fix until an answer is scored.
 * First visit (no attempts): [ Find your level, with "When is your exam?"* ] then [ Exam parts, four in a row ].
 * The Account tab (a link to the Account page) is always in the nav, whatever the flags.
 *
 * * flag `examCountdown`; with it off, Practise next takes the full row. After Skip (or Remove date) the slot shows a
 *   small "Add exam date".
 * Exam part tiles: all four, always. A live part (`PART_LIVE`) says Start / Practise; the others "Coming soon".
 * `?flags=off` previews the page with every flag off.
 *
 * `?mock=1` (mock mode): the demo student (server/demo/demo-data.ts) instead of the caller's own data, through the
 * same code. No database, no cookie read, no API call (the exam date changes only on the page); works with no
 * configuration at all (a Vercel Preview with no variables). Every link keeps ?mock=1, and the demo label is shown.
 */
export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const query = await props.searchParams;
  const flags: FeatureFlags = query.flags === "off" ? allFlags(false) : FEATURE_FLAGS;
  await connection();
  const now = new Date();

  const mock = isMockQuery(query);
  // Mock mode reads nothing: no cookie, no database.
  const userId = mock ? null : await findCurrentUserId();
  const attempts: HistoryAttempt[] = mock ? await demoAttempts(now) : userId ? await listAttemptHistory(userId) : [];
  const stored = mock ? demoExamDate(now) : userId ? await readExamDate(userId) : { examDate: null, examDateSkippedAt: null };
  // Links built from the attempts: in mock mode they open the demo's own pages, with ?mock=1.
  const link = mock ? demoHref : (href: string) => href;

  const tasks: TaskInfo[] = listSpeakingTasks().map(({ id, title, part, level, preparationSeconds, speakingSeconds }) => ({
    id, title, part, level, preparationSeconds, speakingSeconds,
  }));
  const target = getSpeakingRubric(getSpeakingTask(RECOMMENDED_TASK_ID)!).targetLevel as FeatureLevel;
  const summary = progress(attempts, { target, now });
  const latestScored = scoredAttempts(attempts)[0];
  const transcript = !latestScored
    ? ""
    : mock
      ? demoTranscript(latestScored.id)
      : userId
        ? ((await getAttemptViewForUser(userId, latestScored.id)).transcript?.text ?? "")
        : "";
  const builtFix = dashboardFix(attempts, { prompts: (id) => getSpeakingTask(id)?.prompts ?? [], transcript, target });
  const fix = builtFix && { ...builtFix, retryHref: link(builtFix.retryHref) };
  const builtNext = practiseNext(attempts, tasks);
  const next = builtNext && { ...builtNext, href: link(builtNext.href) };
  const tiles: ExamPartTileView[] = partTiles(attempts).map((t) => ({ ...t, part: t.partLabel, href: t.href && link(t.href) }));
  const view = dashboardView(attempts);
  const recent = toHistoryRows(attempts.slice(0, RECENT_ATTEMPT_COUNT), attempts).map((row) => ({ ...row, href: link(row.href) }));

  const today = todayIn(now);
  const exam = examDateState(stored, now);
  const examSlot = (variant: "card" | "inline", className?: string) =>
    flags.examCountdown ? (
      <ExamDate state={exam} today={today} max={addDays(today, MAX_DAYS_AHEAD)} variant={variant} demo={mock} className={className} />
    ) : null;
  const countdown = flags.examCountdown;

  return (
    <div className="min-h-dvh bg-page font-ui text-fg lg:p-6">
      <div className="mx-auto flex max-w-[1280px] px-4 pt-4 lg:gap-6 lg:rounded-shell lg:bg-shell lg:p-6 lg:shadow-card">
        <aside className="lg:flex lg:w-12 lg:shrink-0 lg:flex-col lg:items-center lg:gap-14">
          <Wordmark className="hidden lg:flex lg:h-12" mock={mock} />
          <Sidebar items={navItemsFor(flags, mock)} activeHref="/dashboard" last={<AccountTab source={mock ? "mock" : "real"} />} />
        </aside>

        <div className="min-w-0 flex-1">
          <header className="mb-4 flex flex-col gap-2 lg:mb-5">
            <div className="flex h-11 items-center justify-between lg:hidden">
              <Wordmark mock={mock} />
              {flags.notifications && <Bell />}
            </div>
            <div className={cx(!flags.search && "hidden sm:block")}>
              <TopBar
                search={flags.search ? <SearchSoon placeholder="Search tasks and lessons…" /> : undefined}
                actions={
                  <>
                    <TopBarLink href={mockLink("/", mock)} icon="layers">
                      All tasks
                    </TopBarLink>
                    {flags.mockExam && (
                      <>
                        <span aria-hidden="true" className="hidden h-4 w-px bg-line sm:block" />
                        <TopBarLink href="/mock-exam" icon="calendar" soon>
                          Mock exam
                        </TopBarLink>
                      </>
                    )}
                    {flags.notifications && (
                      <span className="hidden lg:block">
                        <Bell />
                      </span>
                    )}
                  </>
                }
              />
            </div>
            {mock && <DemoLabel variant="data" className="self-start bg-card" />}
          </header>

          <main id="main" className="grid grid-cols-1 gap-4 pb-28 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.44fr)] lg:pb-0">
            {view === "returning" && summary && fix && next ? (
              <>
                <PractiseNextCard next={next} className={cx("order-1 lg:order-none lg:col-start-1 lg:row-start-1", !countdown && "lg:col-span-2")} />
                {countdown && examSlot("card", "order-2 lg:order-none lg:col-start-2 lg:row-start-1")}
                <ProgressCard
                  progress={summary}
                  flags={flags}
                  className="lg:col-start-1 lg:row-start-2"
                  progressClassName="order-3 lg:order-none"
                  radarClassName="order-5 lg:order-none"
                />
                <ExamPartsCard parts={tiles} className="order-7 lg:order-none lg:col-start-2 lg:row-start-2" />
                <RecentAttemptsCard flags={flags} rows={recent} mock={mock} className="order-6 lg:order-none lg:col-start-1 lg:row-start-3" />
                <BiggestFixCard fix={fix} className="order-4 lg:order-none lg:col-start-2 lg:row-start-3" />
              </>
            ) : (
              <>
                <FindYourLevelCard exam={examSlot("inline")} hasAttempts={view !== "first_visit"} mock={mock} className="lg:col-span-2" />
                {view !== "first_visit" && <RecentAttemptsCard flags={flags} rows={recent} mock={mock} className="lg:col-span-2" />}
                <ExamPartsCard
                  parts={tiles.map((t) => (t.part === "Part 2" ? { ...t, recommendation: "Start with Part 2 · shows your level fastest" } : t))}
                  wide
                  className="lg:col-span-2"
                />
              </>
            )}
          </main>
        </div>
      </div>
      <ComingSoonToast />
    </div>
  );
}

function Bell() {
  return (
    <ComingSoonButton label="Notifications" className={cx(styles.ICON_BUTTON, "size-8")}>
      <Icon name="bell" size={18} />
    </ComingSoonButton>
  );
}
