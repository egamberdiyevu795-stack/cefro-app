import Link from "next/link";
import {
  Card,
  CardHeader,
  ComingSoonButton,
  ComingSoonMenu,
  DeltaLabel,
  GoalBar,
  Icon,
  PillButton,
  ProgressBar,
  RadarChart,
  StatRow,
  cx,
  styles,
} from "@/components/ds";
import type { FeatureFlags } from "@/config/features";
import { AttemptRow } from "@/features/history/sections";
import type { HistoryRow } from "@/features/history/view-model";
import { ATTEMPT_MENU_ITEMS, FIRST_VISIT } from "./mock-data";
import { radarAxes, RADAR_RINGS, type DashboardFix, type PractiseNext, type Progress } from "./progress";

/*
 * Dashboard cards. Each takes a `className` for its place in the page grid (order on phones, cell on desktop).
 * Everything is built from components/ds and the design-system tokens; the values come from the student's own
 * attempts (progress.ts), except the first visit's wording.
 */

/** The recommended next task, with the screen's one black button. A retry shows its goal. */
export function PractiseNextCard({ next, className }: { next: PractiseNext; className?: string }) {
  return (
    <Card aria-labelledby="next-title" className={cx("flex items-center justify-between gap-4", className)}>
      <div className="min-w-0">
        <p className="text-caption text-fg-muted">{next.goal ? "Practise next · Retry" : "Practise next"}</p>
        <h2 id="next-title" className="mt-0.5 truncate text-title font-medium tracking-[-0.01em] text-fg">
          {next.title}
        </h2>
        <p className="mt-0.5 text-label text-fg-muted">
          {next.partLabel} · {next.minutes} min · {next.reason}
        </p>
        {next.goal && <p className="mt-1 line-clamp-2 text-label text-fg">Your goal: {next.goal}</p>}
      </div>
      <PillButton href={next.href} label={`Start ${next.goal ? "retry of " : ""}${next.title}`} className="shrink-0">
        Start
      </PillButton>
    </Card>
  );
}

/**
 * First visit (no scored answer yet). "Start your first practice" is the screen's one black action; it goes to the
 * recommended part (Part 2), whose tile only carries a "Recommended" label. `exam` = the exam-date question (flagged).
 */
export function FindYourLevelCard({ exam, className }: { exam: React.ReactNode; className?: string }) {
  return (
    <Card aria-labelledby="find-title" className={cx("flex flex-col justify-center", className)}>
      <p className="text-label text-fg-muted">{FIRST_VISIT.welcome}</p>
      <h2 id="find-title" className="mt-2 text-stat font-light tracking-[-0.03em] text-fg">
        {FIRST_VISIT.title}
      </h2>
      <p className="mt-3 max-w-md text-body text-fg-muted">{FIRST_VISIT.text}</p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <PillButton href={FIRST_VISIT.href}>Start your first practice</PillButton>
        <span className="text-label text-fg-muted">About {FIRST_VISIT.minutes} min</span>
      </div>
      {exam && <div className="mt-6 border-t border-line pt-4">{exam}</div>}
    </Card>
  );
}

/** Blocks that are their own card on phones and plain halves inside the progress card on desktop. */
const SPLIT_HALF = "rounded-card bg-card p-5 shadow-card lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none";

/**
 * Speaking progress + radar: one card on desktop, two on phones. The wrapper is `display: contents` on phones so its
 * halves become separate grid items with their own `order` (passed in as progressClassName / radarClassName).
 */
export function ProgressCard({
  progress,
  flags,
  className,
  progressClassName,
  radarClassName,
}: {
  progress: Progress;
  flags: FeatureFlags;
  className?: string;
  progressClassName?: string;
  radarClassName?: string;
}) {
  const filter = flags.periodFilter ? <PeriodFilter /> : undefined;
  return (
    <section
      aria-labelledby="progress-title"
      className={cx(
        "contents lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] lg:content-start lg:gap-x-8 lg:rounded-card lg:bg-card lg:p-6 lg:shadow-card",
        className,
      )}
    >
      <CardHeader id="progress-title" title="Speaking progress" className="hidden lg:col-span-2 lg:flex" action={filter} />

      <div className={cx(SPLIT_HALF, progressClassName)}>
        <CardHeader title="Speaking progress" className="lg:hidden" action={filter} />
        <div className="flex items-start justify-between gap-3">
          <p className="text-caption text-fg-muted">Current level</p>
          {progress.upFrom && (
            <DeltaLabel label={`Your level went up from ${progress.upFrom} since your earlier answers`}>Up from {progress.upFrom}</DeltaLabel>
          )}
        </div>
        <p className="mt-1 flex items-baseline gap-2">
          <span className="text-stat font-light tracking-[-0.03em]" data-testid="current-level">
            {progress.levelLabel}
          </span>
          <span className="text-lead font-medium">· target {progress.targetLabel}</span>
        </p>
        <p className="mt-1 text-caption text-fg-muted" data-testid="level-basis">
          {progress.basis}
        </p>
        <dl className="mt-6">
          {progress.stats.map((s) => (
            <StatRow key={s.label} label={s.label} value={s.value} />
          ))}
        </dl>
        <div className="mt-6">
          <GoalBar value={progress.goal.assessed ? progress.goal.atTarget / progress.goal.assessed : 0}>{progress.goal.label}</GoalBar>
        </div>
      </div>

      <div className={cx("lg:self-center", SPLIT_HALF, radarClassName)}>
        <CardHeader title="Skills by level" className="lg:hidden" />
        <div className="mx-auto max-w-[24rem] lg:max-w-none">
          <RadarChart axes={radarAxes(progress.skills)} rings={RADAR_RINGS} label="Your level in each skill" />
        </div>
        <p className="mt-2 text-center text-caption text-fg-muted lg:hidden">{progress.basis}</p>
      </div>
    </section>
  );
}

function PeriodFilter() {
  return (
    <ComingSoonButton label="Last 30 days" className={styles.SMALL_ACTION}>
      Last 30 days
      <Icon name="chevronDown" size={14} />
    </ComingSoonButton>
  );
}

/** One exam part tile: its latest band, or "Start" when nothing is scored in it yet. */
export type ExamPartTileView = {
  part: string;
  name: string;
  band: number | null;
  bandLabel: string | null;
  href: string;
  /** Set on the one recommended part (first visit): shown on the tile with a "Recommended" label. */
  recommendation?: string;
};

/** Exam part tiles. `wide` lays the four tiles in one row on larger screens (first visit, full-width card). */
export function ExamPartsCard({ parts, wide = false, className }: { parts: readonly ExamPartTileView[]; wide?: boolean; className?: string }) {
  return (
    <Card aria-labelledby="parts-title" className={className}>
      <CardHeader id="parts-title" title="Exam parts" />
      <ul className={cx("grid grid-cols-2 gap-3", wide && "sm:grid-cols-4")}>
        {parts.map((p) => {
          const tried = p.band !== null;
          return (
            <li key={p.part} className="flex flex-col rounded-tile bg-well p-3" data-testid="part-tile">
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <h3 className="whitespace-nowrap text-caption font-semibold text-fg">{p.part}</h3>
                {p.recommendation && (
                  <span className="rounded-full bg-card px-2 text-caption font-medium text-fg-muted">Recommended</span>
                )}
              </div>
              <p className="truncate text-caption text-fg-muted">{p.name}</p>
              <p className="mt-3 text-title font-medium tracking-[-0.01em] text-fg">{tried ? `Band ${p.band}` : "No band"}</p>
              <p className="text-label text-fg-muted">{p.recommendation ?? p.bandLabel ?? "Not tried yet"}</p>
              <div className="mt-auto pt-3">
                <PillButton href={p.href} variant="light" size="sm" label={`${tried ? "Practise" : "Start"} ${p.part}`}>
                  {tried ? "Practise" : "Start"}
                </PillButton>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** How many attempts the dashboard lists; "See all" opens the History page with the rest. */
export const RECENT_ATTEMPT_COUNT = 4;

/**
 * The student's latest attempts, from the same data and rows as the History page (`rows` = its first rows; null when
 * they could not be read). Each row opens its result; "See all" opens History (flag `history`).
 */
export function RecentAttemptsCard({ flags, rows, className }: { flags: FeatureFlags; rows: readonly HistoryRow[] | null; className?: string }) {
  return (
    <Card aria-labelledby="attempts-title" className={cx("flex flex-col", className)}>
      <CardHeader
        id="attempts-title"
        title="Recent attempts"
        action={
          flags.history ? (
            <Link href="/history" aria-label="See all attempts" className={styles.SMALL_ACTION}>
              See all
            </Link>
          ) : undefined
        }
      />
      {rows === null ? (
        <p className="text-body text-fg-muted">We couldn&apos;t load your attempts right now.</p>
      ) : rows.length === 0 ? (
        <p className="text-body text-fg-muted">No attempts yet. Your answers will be listed here.</p>
      ) : (
        <ul className="-my-1 flex flex-1 flex-col justify-around">
          {rows.slice(0, RECENT_ATTEMPT_COUNT).map((row, i) => (
            <AttemptRow
              key={row.id}
              row={row}
              tone={((i % 4) + 1) as 1 | 2 | 3 | 4}
              menu={
                flags.attemptMenu ? (
                  // Hidden on phones, where it would squeeze the task name onto two lines (it only says "Coming soon").
                  <span className="hidden sm:block">
                    <ComingSoonMenu label={`Options for ${row.title}, ${row.date}`} items={ATTEMPT_MENU_ITEMS} />
                  </span>
                ) : undefined
              }
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

/** The latest scored answer's biggest fix, as on its result page, and how often the same problem still shows. */
export function BiggestFixCard({ fix, className }: { fix: DashboardFix; className?: string }) {
  const { fix: view, stillIn } = fix;
  return (
    <Card aria-labelledby="fix-title" className={cx("flex flex-col", className)}>
      <CardHeader id="fix-title" title="Biggest fix" />
      <p className="text-caption text-fg-muted">
        {view.label} · {fix.taskTitle}
      </p>
      <p className="mt-3 text-caption text-fg-muted">{view.quoteLabel}</p>
      <blockquote className="mt-1 border-l-2 border-accent pl-3 text-body text-fg">
        {view.quoteKind === "student" ? `“${view.quote}”` : view.quote}
      </blockquote>
      <p className="mt-4 text-caption text-fg-muted">{view.adviceLabel}</p>
      <p className="mt-1 text-body font-medium text-fg">{view.tryInstead}</p>
      {stillIn && (
        <div className="mt-5 border-t border-line pt-4" data-testid="still-in">
          <div className="mb-2 flex items-center justify-between gap-3 text-label">
            <span className="text-fg-muted">
              Still in {stillIn.count} of your last {stillIn.of} answers
            </span>
            <span className="font-semibold">
              {stillIn.count}/{stillIn.of}
            </span>
          </div>
          <ProgressBar value={stillIn.count / stillIn.of} label={`Still in ${stillIn.count} of your last ${stillIn.of} answers`} />
        </div>
      )}
      <div className="mt-auto pt-5">
        <PillButton href={fix.retryHref} icon="retry" variant="quiet" className="w-full">
          Start retry
        </PillButton>
      </div>
    </Card>
  );
}

export function Wordmark({ className = "flex" }: { className?: string }) {
  return (
    <Link href="/dashboard" className={cx("items-center text-body font-semibold tracking-[0.08em] text-fg", className)}>
      CEFRO
    </Link>
  );
}
