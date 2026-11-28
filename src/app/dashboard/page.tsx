import type { Metadata } from "next";
import { connection } from "next/server";
import { DemoLabel, Sidebar, TopBar, TopBarLink, cx } from "@/components/ds";
import { FEATURE_FLAGS, allFlags, fullMockLive, type FeatureFlags } from "@/config/features";
import { getSpeakingTask, listSpeakingTasks } from "@/content/speaking";
import { getArgumentTask } from "@/content/speaking/part3";
import { addDays, examDateState, MAX_DAYS_AHEAD, todayIn } from "@/domain/exam-date";
import type { HistoryAttempt, HistoryMock } from "@/domain/speaking/history";
import { AccountTab } from "@/features/dashboard/AccountTab";
import { ExamDate } from "@/features/dashboard/ExamDate";
import { ContinueMockCard } from "@/features/full-mock/screens";
import { demoAttempts, demoExamDate, demoHref, demoTranscript } from "@/server/demo/demo-data";
import { isMockQuery, mockLink } from "@/features/demo/demo-mode";
import { navItemsFor } from "@/features/dashboard/mock-data";
import {
  dashboardFix,
  dashboardView,
  partTiles,
  practiseNext,
  progress,
  progressPreview,
  scoredAttempts,
  type TaskInfo,
} from "@/features/dashboard/progress";
import {
  BiggestFixCard,
  ExamPartsCard,
  FindYourLevelCard,
  GuestCard,
  PractiseNextCard,
  ProgressCard,
  BiggestFixPreviewCard,
  ProgressPreviewCard,
  RECENT_ATTEMPT_COUNT,
  RecentAttemptsCard,
  Wordmark,
  type ExamPartTileView,
} from "@/features/dashboard/sections";
import { recentRows } from "@/features/history/view-model";
import { getAttemptViewForUser, listAttemptHistory } from "@/server/attempts/attempt-service";
import { DEMO_MOCK_HREF, demoMockHistory } from "@/server/demo/demo-mock";
import { listMockHistory } from "@/server/sessions/mock-history";
import { levelTarget } from "@/server/dashboard/target";
import { readExamDate } from "@/server/exam-date/exam-date-store";
import { findInProgressMock } from "@/server/sessions/mock-service";
import { findCurrentUserId, isSignedIn } from "@/server/identity/current-user";
import { asDemoTeacher, isDemoTeacherQuery, teacherLinks } from "@/features/teacher/links";
import { YourClassesCard } from "@/features/teacher/sections";
import { classSummary, type ClassSummary } from "@/features/teacher/view-model";
import { DEMO_CLASS, demoClassStudents } from "@/server/demo/demo-teacher";
import { teacherLive } from "@/server/teacher/release";
import { classWithStudents } from "@/server/teacher/teacher-service";
import { listOwnClasses, userRole } from "@/server/teacher/teacher-store";

export const metadata: Metadata = { title: "Dashboard" };

/*
 * The student's dashboard, from their own attempts (`listAttemptHistory`, the same owner rule as History and the
 * result page) and their exam date. Every number is computed by the pure functions in features/dashboard/progress.ts.
 *
 * Returning (at least one scored answer), desktop:
 *   row 1: [ Practise next             ] [ Exam date*      ]
 *   row 2: [ Speaking progress + radar ] [ Exam parts      ]
 *   row 3: [ Recent attempts           ] [ Biggest fix     ]
 * Returning, phone: practise next, exam date*, progress, biggest fix, radar, recent attempts, exam parts.
 * First visit (no attempts), and attempts none scored yet: the returning layout's cards in the same places, each showing
 *   what will appear in it: [ Find your level | When is your exam?* ], [ Speaking progress, empty | Exam parts ],
 *   [ Recent attempts (empty, or the unscored ones) | Biggest fix, empty ]. Nothing moves when the first result
 *   arrives. No black button but "Start your first practice" / "Start practice", no number that reads as a result.
 * The Account tab (a link to the Account page) is always in the nav, whatever the flags.
 * Signed out (no account, not mock mode): a quiet "You are not signed in" card (GuestCard), whatever the view: first on
 *   phones, under the cards on desktop (the cards have fixed rows).
 *
 * * flag `examCountdown`; with it off, Practise next takes the full row. After Skip (or Remove date) the slot shows a
 *   small "Add exam date".
 * Exam part tiles: all four, always. A live part (`PART_LIVE`) says Start / Practise; the others "Coming soon" (text,
 *   no link: the only "Coming soon" on any page). No control on this page does nothing (no search, bell, Mock exam,
 *   period filter or attempt row menu: removed before launch).
 * `?flags=off` previews the page with every flag off.
 * A full mock in progress (docs/v1-plan.md, step 2; only while the real mock is open) puts "Continue your mock" on top of
 * Home: its "Continue" is then the page's one black button, and Practise next / Start practice are grey.
 *
 * `?mock=1` (mock mode): the demo student (server/demo/demo-data.ts) instead of the caller's own data, through the
 * same code. No database, no cookie read, no API call (the exam date changes only on the page); works with no
 * configuration at all (a Vercel Preview with no variables). Every link keeps ?mock=1, and the demo label is shown.
 *
 * Teacher view (docs/teacher-plan.md, T1): a teacher's Home starts with "Your classes", whose "Create class" is the
 * page's one black button (Practise next / Start practice are grey for a teacher). A teacher never sees the student
 * "Find your level" onboarding card (their Home is about their classes; the Exam parts tiles stay, so they can still
 * open a task). Real teachers only once the Teacher
 * view is on (parent consent); `?mock=1&as=teacher` is the demo teacher (Demo class, six made-up students, no
 * practice of their own).
 */
export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const query = await props.searchParams;
  const flags: FeatureFlags = query.flags === "off" ? allFlags(false) : FEATURE_FLAGS;
  await connection();
  const now = new Date();

  const mock = isMockQuery(query);
  const demoTeacher = mock && isDemoTeacherQuery(query);
  // Mock mode reads nothing: no cookie, no database.
  const userId = mock ? null : await findCurrentUserId();
  // Signed out (an anonymous browser, or nobody yet): the guest card on top. Mock mode is the demo account.
  const guest = !mock && !(await isSignedIn());
  const isTeacher = demoTeacher || (userId !== null && teacherLive() && (await userRole(userId)) === "teacher");
  const classes: ClassSummary[] | null = !isTeacher
    ? null
    : demoTeacher
      ? [classSummary(DEMO_CLASS, await demoClassStudents(now))]
      : await Promise.all((await listOwnClasses(userId!)).map(async (c) => classSummary(c, (await classWithStudents(userId!, c.id)).students)));
  const mockInProgress = !mock && userId && fullMockLive() ? await findInProgressMock(userId) : null;
  const quietNext = isTeacher || mockInProgress !== null;
  const teacherHref = (path: string) => (demoTeacher ? asDemoTeacher(path) : path);
  const attempts: HistoryAttempt[] = demoTeacher ? [] : mock ? await demoAttempts(now) : userId ? await listAttemptHistory(userId) : [];
  const stored = demoTeacher ? { examDate: null, examDateSkippedAt: null } : mock ? demoExamDate(now) : userId ? await readExamDate(userId) : { examDate: null, examDateSkippedAt: null };
  // Links built from the attempts: in mock mode they open the demo's own pages, with ?mock=1.
  const link = mock ? demoHref : (href: string) => href;

  const tasks: TaskInfo[] = listSpeakingTasks().map(({ id, title, part, level, preparationSeconds, speakingSeconds }) => ({
    id, title, part, level, preparationSeconds, speakingSeconds,
  }));
  const target = levelTarget();
  const summary = progress(attempts, { target, now });
  const latestScored = scoredAttempts(attempts)[0];
  const transcript = !latestScored
    ? ""
    : mock
      ? demoTranscript(latestScored.id)
      : userId
        ? ((await getAttemptViewForUser(userId, latestScored.id)).transcript?.text ?? "")
        : "";
  const builtFix = dashboardFix(attempts, {
    prompts: (id) => getSpeakingTask(id)?.prompts ?? [],
    transcript,
    target,
    argumentPoints: (id) => getArgumentTask(id)?.points,
  });
  const fix = builtFix && { ...builtFix, retryHref: link(builtFix.retryHref) };
  const builtNext = practiseNext(attempts, tasks);
  const next = builtNext && { ...builtNext, href: link(builtNext.href) };
  const tiles: ExamPartTileView[] = partTiles(attempts).map((t) => ({ ...t, part: t.partLabel, href: t.href && link(t.href) }));
  const view = dashboardView(attempts);
  // Recent attempts: a mock is one row opening the mock result, like History (its parts still count in the numbers above).
  const demoMock = mock && !demoTeacher ? await demoMockHistory(now) : null;
  const mocks: HistoryMock[] = demoTeacher ? [] : demoMock ? demoMock.mocks : userId ? await listMockHistory(userId) : [];
  const recent = recentRows(demoMock ? [...attempts, ...demoMock.attempts] : attempts, mocks, RECENT_ATTEMPT_COUNT).map((row) => ({
    ...row,
    href: row.mock ? (mock ? DEMO_MOCK_HREF : row.href) : link(row.href),
  }));

  const today = todayIn(now);
  const exam = examDateState(stored, now);
  const examSlot = (variant: "card" | "inline", className?: string) =>
    flags.examCountdown ? (
      <ExamDate state={exam} today={today} max={addDays(today, MAX_DAYS_AHEAD)} variant={variant} demo={mock} className={className} />
    ) : null;
  const countdown = flags.examCountdown;

  return (
    <div className="min-h-dvh bg-page font-ui text-fg md:p-6">
      <div className="mx-auto flex max-w-[1280px] px-4 pt-4 md:min-h-[calc(100dvh-3rem)] md:gap-6 md:rounded-shell md:bg-shell md:p-6 md:shadow-card">
        <aside className="md:flex md:w-12 md:shrink-0 md:flex-col md:items-center md:gap-14">
          <Wordmark className="hidden md:flex md:h-12" mock={mock} href={demoTeacher ? asDemoTeacher("/dashboard") : undefined} />
          <Sidebar
            items={navItemsFor(flags, mock).map((item) => (demoTeacher && item.href.startsWith("/dashboard") ? { ...item, href: asDemoTeacher("/dashboard") } : item))}
            activeHref="/dashboard"
            last={<AccountTab source={mock ? "mock" : "real"} href={demoTeacher ? asDemoTeacher("/profile") : undefined} />}
          />
        </aside>

        <div className="min-w-0 flex-1">
          <header className="mb-4 flex flex-col gap-2 md:mb-5">
            <div className="flex h-11 items-center md:hidden">
              <Wordmark mock={mock} href={demoTeacher ? asDemoTeacher("/dashboard") : undefined} />
            </div>
            <div className="hidden sm:block">
              <TopBar
                actions={
                  <TopBarLink href={mockLink("/practice", mock)} icon="layers">
                    All tasks
                  </TopBarLink>
                }
              />
            </div>
            {mock && <DemoLabel variant={demoTeacher ? "class" : "data"} className="self-start bg-card" />}
          </header>

          <main id="main" className="grid grid-cols-1 gap-4 pb-28 md:pb-0 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.44fr)]">
            {guest && <GuestCard className="order-first lg:col-span-2" />}
            {classes && (
              <YourClassesCard
                classes={classes}
                newClassHref={teacherHref(teacherLinks.newClass)}
                classHref={(id) => teacherHref(teacherLinks.cls(id))}
                className="order-first lg:col-span-2"
              />
            )}
            {mockInProgress && (
              <ContinueMockCard
                href="/practice/mock"
                done={mockInProgress.parts.filter((p) => p.attemptId).map((p) => p.part)}
                quiet={isTeacher}
                className="order-first lg:col-span-2"
              />
            )}
            {view === "returning" && summary && fix && next ? (
              <>
                <PractiseNextCard next={next} quiet={quietNext} className={cx("order-1 lg:order-none lg:col-start-1 lg:row-start-1", !countdown && "lg:col-span-2")} />
                {countdown && examSlot("card", "order-2 lg:order-none lg:col-start-2 lg:row-start-1")}
                <ProgressCard
                  progress={summary}
                  className="lg:col-start-1 lg:row-start-2"
                  progressClassName="order-3 lg:order-none"
                  radarClassName="order-5 lg:order-none"
                />
                <ExamPartsCard parts={tiles} className="order-7 lg:order-none lg:col-start-2 lg:row-start-2" />
                <RecentAttemptsCard flags={flags} rows={recent} mock={mock} className="order-6 lg:order-none lg:col-start-1 lg:row-start-3" />
                <BiggestFixCard fix={fix} className="order-4 lg:order-none lg:col-start-2 lg:row-start-3" />
              </>
            ) : !isTeacher ? (
              // No scored answer yet: the same cards in the same places as a returning student's Home, each showing what
              // will appear in it, so nothing moves when the first result arrives (phones: the same order too).
              <>
                <FindYourLevelCard
                  exam={countdown ? null : examSlot("inline")}
                  hasAttempts={view !== "first_visit"}
                  mock={mock}
                  quiet={quietNext}
                  className={cx("order-1 lg:order-none lg:col-start-1 lg:row-start-1", !countdown && "lg:col-span-2")}
                />
                {countdown && examSlot("card", "order-2 lg:order-none lg:col-start-2 lg:row-start-1")}
                <ProgressPreviewCard preview={progressPreview(attempts, { target, now })} className="order-3 lg:order-none lg:col-start-1 lg:row-start-2" />
                <ExamPartsCard
                  parts={tiles.map((t) => (t.part === "Part 2" ? { ...t, recommendation: "Start with Part 2 · shows your level fastest" } : t))}
                  className="order-7 lg:order-none lg:col-start-2 lg:row-start-2"
                />
                <RecentAttemptsCard flags={flags} rows={recent} mock={mock} className="order-6 lg:order-none lg:col-start-1 lg:row-start-3" />
                <BiggestFixPreviewCard className="order-4 lg:order-none lg:col-start-2 lg:row-start-3" />
              </>
            ) : null /* A teacher's Home is their classes: no student "Exam parts" card ("Recommended", "shows your level fastest"). */}
          </main>
        </div>
      </div>
    </div>
  );
}
