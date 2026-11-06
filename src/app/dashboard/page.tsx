import type { Metadata } from "next";
import { connection } from "next/server";
import { ComingSoonButton, ComingSoonToast, Icon, Sidebar, SearchSoon, TopBar, TopBarLink, cx, styles } from "@/components/ds";
import { FEATURE_FLAGS, allFlags, type FeatureFlags } from "@/config/features";
import { DASHBOARD_STATE, EXAM_PARTS, EXAM_PARTS_FIRST_VISIT, navItemsFor, type DashboardState } from "@/features/dashboard/mock-data";
import { AccountMenu } from "@/features/dashboard/AccountMenu";
import {
  BiggestFixCard,
  ExamCountdownCard,
  ExamPartsCard,
  FindYourLevelCard,
  PractiseNextCard,
  ProgressCard,
  RECENT_ATTEMPT_COUNT,
  RecentAttemptsCard,
  Wordmark,
} from "@/features/dashboard/sections";
import { toHistoryRows, type HistoryRow } from "@/features/history/view-model";
import { listAttemptHistory } from "@/server/attempts/attempt-service";
import { findCurrentUserId } from "@/server/identity/current-user";
import { logger } from "@/server/logging/logger";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * The student's own latest attempts (the History page's rows), or null when they cannot be read: the rest of the
 * dashboard is mocked, so a database problem only replaces this card's list with a line, never the whole page.
 */
async function recentAttempts(): Promise<HistoryRow[] | null> {
  try {
    const userId = await findCurrentUserId();
    if (!userId) return [];
    const attempts = await listAttemptHistory(userId);
    return toHistoryRows(attempts.slice(0, RECENT_ATTEMPT_COUNT), attempts);
  } catch (error) {
    logger.error("Could not read recent attempts for the dashboard", { error });
    return null;
  }
}

/*
 * Design prototype: every value on this page is mocked (features/dashboard/mock-data.ts), except Recent attempts,
 * which lists the student's real attempts (the same rows as /history) and links to History with "See all".
 *
 * Prototype switches (for screenshots and reviews):
 *   ?state=first-visit | returning   overrides DASHBOARD_STATE in mock-data.ts
 *   ?flags=off                        turns every feature flag off (src/config/features.ts)
 *
 * Returning, desktop (like the reference): wide left column, narrow right column.
 *   row 1: [ Practise next             ] [ Exam countdown* ]
 *   row 2: [ Speaking progress + radar ] [ Exam parts      ]
 *   row 3: [ Recent attempts           ] [ Biggest fix     ]
 * Returning, phone: practise next, countdown*, progress, biggest fix, radar, recent attempts, exam parts.
 *
 * First visit, desktop: [ Find your level (with the "When is your exam?" prompt*) ] then [ Exam parts, four in a row ].
 * First visit, phone: find your level, exam parts.
 * The Account item (with Log out) is always in the nav, whatever the flags.
 *
 * * flagged; when it is off, the card beside it takes the full row.
 */
export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const query = await props.searchParams;
  const state: DashboardState = query.state === "first-visit" || query.state === "returning" ? query.state : DASHBOARD_STATE;
  const flags: FeatureFlags = query.flags === "off" ? allFlags(false) : FEATURE_FLAGS;
  const countdown = flags.examCountdown;
  await connection();
  const recent = state === "returning" ? await recentAttempts() : [];

  return (
    <div className="min-h-dvh bg-page font-ui text-fg lg:p-6">
      <div className="mx-auto flex max-w-[1280px] px-4 pt-4 lg:gap-6 lg:rounded-shell lg:bg-shell lg:p-6 lg:shadow-card">
        <aside className="lg:flex lg:w-12 lg:shrink-0 lg:flex-col lg:items-center lg:gap-14">
          <Wordmark className="hidden lg:flex lg:h-12" />
          <Sidebar items={navItemsFor(flags)} activeHref="/dashboard" last={<AccountMenu />} />
        </aside>

        <div className="min-w-0 flex-1">
          <header className="mb-4 flex flex-col gap-2 lg:mb-5">
            <div className="flex h-11 items-center justify-between lg:hidden">
              <Wordmark />
              {flags.notifications && <Bell />}
            </div>
            <div className={cx(!flags.search && "hidden sm:block")}>
              <TopBar
                search={flags.search ? <SearchSoon placeholder="Search tasks and lessons…" /> : undefined}
                actions={
                  <>
                    <TopBarLink href="/" icon="layers">
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
          </header>

          <main id="main" className="grid grid-cols-1 gap-4 pb-28 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.44fr)] lg:pb-0">
            {state === "returning" ? (
              <>
                <PractiseNextCard className={cx("order-1 lg:order-none lg:col-start-1 lg:row-start-1", !countdown && "lg:col-span-2")} />
                {countdown && <ExamCountdownCard className="order-2 lg:order-none lg:col-start-2 lg:row-start-1" />}
                <ProgressCard
                  flags={flags}
                  className="lg:col-start-1 lg:row-start-2"
                  progressClassName="order-3 lg:order-none"
                  radarClassName="order-5 lg:order-none"
                />
                <ExamPartsCard parts={EXAM_PARTS} className="order-7 lg:order-none lg:col-start-2 lg:row-start-2" />
                <RecentAttemptsCard flags={flags} rows={recent} className="order-6 lg:order-none lg:col-start-1 lg:row-start-3" />
                <BiggestFixCard className="order-4 lg:order-none lg:col-start-2 lg:row-start-3" />
              </>
            ) : (
              <>
                <FindYourLevelCard flags={flags} className="lg:col-span-2" />
                <ExamPartsCard parts={EXAM_PARTS_FIRST_VISIT} wide className="lg:col-span-2" />
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
