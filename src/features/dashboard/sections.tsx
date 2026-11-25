import Link from "next/link";
import {
  Card,
  CardHeader,
  DeltaLabel,
  GoalBar,
  Icon,
  PillButton,
  ProgressBar,
  RadarChart,
  StatRow,
  cx,
  styles,
  WordmarkLink,
} from "@/components/ds";
import type { FeatureFlags } from "@/config/features";
import { mockLink } from "@/features/demo/demo-mode";
import { AttemptRow } from "@/features/history/sections";
import { levelOfBand, type HistoryRow } from "@/features/history/view-model";
import { FIRST_VISIT, NOT_SCORED_YET } from "./mock-data";
import { emptyRadarAxes, radarAxes, RADAR_RINGS, type DashboardFix, type PractiseNext, type Progress, type ProgressPreview } from "./progress";

/*
 * Dashboard cards. Each takes a `className` for its place in the page grid (order on phones, cell on desktop).
 * Everything is built from components/ds and the design-system tokens; the values come from the student's own
 * attempts (progress.ts), except the first visit's wording.
 */

/** The recommended next task, with the screen's one black button. A retry shows its goal. */
export function PractiseNextCard({ next, quiet = false, className }: { next: PractiseNext; quiet?: boolean; className?: string }) {
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
        {/* The whole goal, on every screen size: it is what the retry is for. */}
        {next.goal && <p className="mt-1 break-words text-label text-fg" data-testid="next-goal">Your goal: {next.goal}</p>}
      </div>
      <PillButton href={next.href} variant={quiet ? "quiet" : "primary"} label={`Start ${next.goal ? "retry of " : ""}${next.title}`} className="shrink-0">
        Start
      </PillButton>
    </Card>
  );
}

/**
 * Signed out (not mock mode): a quiet card on top of Home, so a student who opens the dashboard link without an account
 * knows where they stand before they practise. Grey "Create account" (the page's one black button stays its own main
 * action) and a "Sign in" text link; both come back to the dashboard. Signing up keeps this browser's practice.
 */
export function GuestCard({ className }: { className?: string }) {
  return (
    <Card aria-labelledby="guest-title" data-testid="guest-card" className={cx("flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div>
        <h2 id="guest-title" className="text-title font-medium text-fg">
          You are not signed in
        </h2>
        <p className="mt-1 text-body text-fg-muted">Your practice is kept on this browser only. Create an account to save your results.</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <PillButton href="/register?next=%2Fdashboard" variant="quiet">
          Create account
        </PillButton>
        <Link
          href="/login?next=%2Fdashboard"
          className={cx("inline-flex min-h-11 items-center px-1 text-body font-medium text-fg underline underline-offset-4", styles.FOCUS_RING)}
        >
          Sign in
        </Link>
      </div>
    </Card>
  );
}

/**
 * No scored answer yet: the first visit, or (`hasAttempts`) a student whose attempts are all still scoring or failed.
 * "Start your first practice" ("Start practice" with attempts) is the screen's one black action; it goes to the
 * recommended part (Part 2), whose tile only carries a "Recommended" label. `exam` = the exam-date question (flagged).
 */
export function FindYourLevelCard({
  exam,
  hasAttempts = false,
  mock = false,
  quiet = false,
  className,
}: {
  exam: React.ReactNode;
  /** A teacher's Home: the page's black button is "Create class", so this one is grey. */
  quiet?: boolean;
  /** The student has attempts, none scored yet: "Welcome back" and "Start practice" (not their first). */
  hasAttempts?: boolean;
  /** Mock mode: the link keeps ?mock=1. */
  mock?: boolean;
  className?: string;
}) {
  const copy = hasAttempts ? NOT_SCORED_YET : FIRST_VISIT;
  return (
    <Card aria-labelledby="find-title" className={cx("flex flex-col justify-center", className)}>
      <p className="text-label text-fg-muted">{copy.welcome}</p>
      <h2 id="find-title" className="mt-2 text-stat font-light tracking-[-0.03em] text-fg">
        {copy.title}
      </h2>
      <p className="mt-3 max-w-md text-body text-fg-muted">{copy.text}</p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <PillButton href={mockLink(FIRST_VISIT.href, mock)} variant={quiet ? "quiet" : "primary"}>{hasAttempts ? "Start practice" : "Start your first practice"}</PillButton>
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
  className,
  progressClassName,
  radarClassName,
}: {
  progress: Progress;
  className?: string;
  progressClassName?: string;
  radarClassName?: string;
}) {
  return (
    <section
      aria-labelledby="progress-title"
      className={cx(
        "contents lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] lg:content-start lg:gap-x-8 lg:rounded-card lg:bg-card lg:p-6 lg:shadow-card",
        className,
      )}
    >
      <CardHeader id="progress-title" title="Speaking progress" className="hidden lg:col-span-2 lg:flex" />

      <div className={cx(SPLIT_HALF, progressClassName)}>
        <CardHeader title="Speaking progress" className="lg:hidden" />
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

/**
 * No scored answer yet: the same Speaking progress card, empty, so a new student sees what they will get before they
 * practise (otherwise the radar only appears after the first scored answer). No number that could be read as a
 * result: "—" for the level, the practice numbers at their real values (zero on a first visit), a grey pill (the page's
 * one black button stays "Start your first practice") and a radar with only its skill names. One card on every screen.
 */
export const PREVIEW_PLACEHOLDER = "No data yet";
export const PREVIEW_UNLOCK = "Answer 1 task to unlock your skills map";

export function ProgressPreviewCard({ preview, className }: { preview: ProgressPreview; className?: string }) {
  return (
    <section
      aria-labelledby="progress-preview-title"
      data-testid="progress-preview"
      className={cx(
        "grid grid-cols-1 gap-6 rounded-card bg-card p-5 shadow-card lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] lg:gap-x-8 lg:gap-y-0 lg:p-6",
        className,
      )}
    >
      <CardHeader id="progress-preview-title" title="Speaking progress" className="lg:col-span-2" />

      <div>
        <p className="text-caption text-fg-muted">Current level</p>
        <p className="mt-1 flex items-baseline gap-2">
          <span className="text-stat font-light tracking-[-0.03em] text-fg-muted" aria-hidden="true">
            —
          </span>
          <span className="sr-only">No level yet</span>
          <span className="text-lead font-medium">· target {preview.targetLabel}</span>
        </p>
        <p className="mt-1 text-caption text-fg-muted">Appears after your first scored answer</p>
        <dl className="mt-6">
          {preview.stats.map((s) => (
            <StatRow key={s.label} label={s.label} value={s.value} />
          ))}
        </dl>
        <div className="mt-6 flex h-9 items-center gap-2.5 rounded-full bg-well pl-1.5 pr-4">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-card text-fg-muted">
            <Icon name="mic" size={14} />
          </span>
          <span className="text-label text-fg">{PREVIEW_UNLOCK}</span>
        </div>
      </div>

      <div className="lg:self-center">
        <div className="mx-auto max-w-[24rem] lg:max-w-none">
          <RadarChart axes={emptyRadarAxes()} rings={RADAR_RINGS} label="Your level in each skill, empty until your first scored answer" placeholder={PREVIEW_PLACEHOLDER} />
        </div>
      </div>
    </section>
  );
}

/** One exam part tile: its latest level and band, or "Start" when nothing is scored in it yet; "Coming soon" with no task yet. */
export type ExamPartTileView = {
  part: string;
  name: string;
  band: number | null;
  bandLabel: string | null;
  /** Null: the part has no task yet. The tile says "Coming soon" and has no link. */
  href: string | null;
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
          if (p.href === null) {
            return (
              <li key={p.part} className="flex flex-col rounded-tile bg-well p-3" data-testid="part-tile">
                <h3 className="whitespace-nowrap text-caption font-semibold text-fg">{p.part}</h3>
                <p className="truncate text-caption text-fg-muted">{p.name}</p>
                <p className="mt-3 text-label text-fg-muted">Coming soon</p>
              </li>
            );
          }
          return (
            <li key={p.part} className="flex flex-col rounded-tile bg-well p-3" data-testid="part-tile">
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <h3 className="whitespace-nowrap text-caption font-semibold text-fg">{p.part}</h3>
                {p.recommendation && (
                  <span className="rounded-full bg-card px-2 text-caption font-medium text-fg-muted">Recommended</span>
                )}
              </div>
              <p className="truncate text-caption text-fg-muted">{p.name}</p>
              {/* The level leads (as on Home and History); the exam band is the smaller line under it. */}
              <p className="mt-3 text-title font-medium tracking-[-0.01em] text-fg">{tried && p.bandLabel ? levelOfBand(p.bandLabel) : "No level"}</p>
              <p className="text-label text-fg-muted">{p.recommendation ?? (tried ? `Band ${p.band} · ${p.bandLabel}` : "Not tried yet")}</p>
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
export function RecentAttemptsCard({
  flags,
  rows,
  mock = false,
  className,
}: {
  flags: FeatureFlags;
  rows: readonly HistoryRow[] | null;
  /** Mock mode: "See all" keeps ?mock=1 (the rows carry their own links). */
  mock?: boolean;
  className?: string;
}) {
  return (
    <Card aria-labelledby="attempts-title" className={cx("flex flex-col", className)}>
      <CardHeader
        id="attempts-title"
        title="Recent attempts"
        action={
          flags.history ? (
            <Link href={mockLink("/history", mock)} aria-label="See all attempts" className={styles.SMALL_ACTION}>
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
        // Spread over the card's height only when there are enough rows; one or two stay at the top, not floating
        // in the middle of a card stretched to its neighbour's height.
        <ul className={cx("-my-1 flex flex-1 flex-col", rows.length >= 3 ? "justify-around" : "justify-start")}>
          {rows.slice(0, RECENT_ATTEMPT_COUNT).map((row, i) => (
            <AttemptRow
              key={row.id}
              row={row}
              tone={((i % 4) + 1) as 1 | 2 | 3 | 4}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

/** The latest scored answer's biggest fix, as on its result page, and how often the same problem still shows. */
/**
 * No scored answer yet: the Biggest fix card in its place, with what will appear in it, so a new student's Home has the
 * same cards in the same places as a returning student's. No black button and nothing that reads as a result.
 */
export function BiggestFixPreviewCard({ className }: { className?: string }) {
  return (
    <Card aria-labelledby="fix-title" data-testid="fix-preview" className={cx("flex flex-col", className)}>
      <CardHeader id="fix-title" title="Biggest fix" />
      <p className="text-caption text-fg-muted">You said</p>
      <blockquote className="mt-1 border-l-2 border-line pl-3 text-body text-fg-muted">Your own words will appear here.</blockquote>
      <p className="mt-4 text-body text-fg-muted">
        After your first answer, this shows the one thing to fix first, with a better way to say it.
      </p>
    </Card>
  );
}

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

export function Wordmark({ className = "flex", mock = false, href }: { className?: string; mock?: boolean; href?: string }) {
  return (
    <WordmarkLink href={href ?? mockLink("/dashboard", mock)} className={className} />
  );
}
