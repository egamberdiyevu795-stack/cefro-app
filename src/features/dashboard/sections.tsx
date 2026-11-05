import Link from "next/link";
import {
  Card,
  CardHeader,
  ComingSoonButton,
  ComingSoonMenu,
  DeltaLabel,
  GoalBar,
  Icon,
  ListRow,
  PillButton,
  ProgressBar,
  RadarChart,
  ScoringLabel,
  StatRow,
  Thumb,
  cx,
  styles,
} from "@/components/ds";
import type { FeatureFlags } from "@/config/features";
import {
  ATTEMPT_MENU_ITEMS,
  BIGGEST_FIX,
  EXAM_COUNTDOWN,
  FIRST_VISIT,
  PRACTISE_NEXT,
  PROGRESS,
  RADAR_AXES,
  RADAR_RINGS,
  RECENT_ATTEMPTS,
  type ExamPart,
} from "./mock-data";

/*
 * Dashboard cards. Each takes a `className` for its place in the page grid (order on phones, cell on desktop).
 * Everything is built from components/ds and the design-system tokens; values come from mock-data.ts.
 */

export function PractiseNextCard({ className }: { className?: string }) {
  return (
    <Card aria-labelledby="next-title" className={cx("flex items-center justify-between gap-4", className)}>
      <div className="min-w-0">
        <p className="text-caption text-fg-muted">Practise next</p>
        <h2 id="next-title" className="mt-0.5 truncate text-title font-medium tracking-[-0.01em] text-fg">
          {PRACTISE_NEXT.task}
        </h2>
        <p className="mt-0.5 text-label text-fg-muted">
          {PRACTISE_NEXT.part} · {PRACTISE_NEXT.minutes} min · {PRACTISE_NEXT.reason}
        </p>
      </div>
      <PillButton href={PRACTISE_NEXT.href} label={`Start ${PRACTISE_NEXT.task}`} className="shrink-0">
        Start
      </PillButton>
    </Card>
  );
}

export function ExamCountdownCard({ className }: { className?: string }) {
  return (
    <Card aria-labelledby="exam-title" className={cx("flex items-center justify-between gap-4", className)}>
      <div>
        <p id="exam-title" className="text-caption text-fg-muted">
          Your exam
        </p>
        <p className="mt-0.5 text-title font-medium tracking-[-0.01em] text-fg">in {EXAM_COUNTDOWN.days} days</p>
        <p className="mt-0.5 text-label text-fg-muted">{EXAM_COUNTDOWN.date}</p>
      </div>
      <ComingSoonButton label="Edit exam date" className={styles.SMALL_ACTION}>
        Edit
      </ComingSoonButton>
    </Card>
  );
}

/**
 * First visit. The screen's one black action is the recommended part's Start (Exam parts), so this card's button is
 * the grey pill and goes to the same task. The exam-date prompt is flagged (`examCountdown`).
 */
export function FindYourLevelCard({ flags, className }: { flags: FeatureFlags; className?: string }) {
  return (
    <Card aria-labelledby="find-title" className={cx("flex flex-col justify-center", className)}>
      <p className="text-label text-fg-muted">{FIRST_VISIT.welcome}</p>
      <h2 id="find-title" className="mt-2 text-stat font-light tracking-[-0.03em] text-fg">
        {FIRST_VISIT.title}
      </h2>
      <p className="mt-3 max-w-md text-body text-fg-muted">{FIRST_VISIT.text}</p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <PillButton href={FIRST_VISIT.href} variant="quiet">
          Start your first practice
        </PillButton>
        <span className="text-label text-fg-muted">About {FIRST_VISIT.minutes} min</span>
      </div>
      {flags.examCountdown && (
        <div className="mt-6 flex items-center justify-between gap-4 border-t border-line pt-4">
          <p className="text-label text-fg-muted">When is your exam?</p>
          <ComingSoonButton label="Add exam date" className={styles.SMALL_ACTION}>
            Add date
          </ComingSoonButton>
        </div>
      )}
    </Card>
  );
}

/** Blocks that are their own card on phones and plain halves inside the progress card on desktop. */
const SPLIT_HALF = "rounded-card bg-card p-5 shadow-card lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none";

/**
 * Speaking progress + radar: one card on desktop, two on phones. The wrapper is `display: contents` on phones so its
 * halves become separate grid items with their own `order` (passed in as progressOrder / radarOrder).
 */
export function ProgressCard({
  flags,
  className,
  progressClassName,
  radarClassName,
}: {
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
        <div className="flex items-start justify-between">
          <p className="text-caption text-fg-muted">Current level</p>
          <DeltaLabel label={PROGRESS.changeDescription}>{PROGRESS.changeLabel}</DeltaLabel>
        </div>
        <p className="mt-1 flex items-baseline gap-2">
          <span className="text-stat font-light tracking-[-0.03em]">{PROGRESS.level}</span>
          <span className="text-lead font-medium">· target {PROGRESS.target}</span>
        </p>
        <dl className="mt-6">
          {PROGRESS.stats.map((s) => (
            <StatRow key={s.label} label={s.label} value={s.value} />
          ))}
        </dl>
        <div className="mt-6">
          <GoalBar value={PROGRESS.goal.atTarget / PROGRESS.goal.assessed}>{PROGRESS.goal.label}</GoalBar>
        </div>
      </div>

      <div className={cx("lg:self-center", SPLIT_HALF, radarClassName)}>
        <CardHeader title="Skills by level" className="lg:hidden" />
        <div className="mx-auto max-w-[24rem] lg:max-w-none">
          <RadarChart axes={RADAR_AXES} rings={RADAR_RINGS} label="Your level in each skill" />
        </div>
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

/** Exam part tiles. `wide` lays the four tiles in one row on larger screens (first visit, full-width card). */
export function ExamPartsCard({ parts, wide = false, className }: { parts: readonly ExamPart[]; wide?: boolean; className?: string }) {
  return (
    <Card aria-labelledby="parts-title" className={className}>
      <CardHeader id="parts-title" title="Exam parts" />
      <ul className={cx("grid grid-cols-2 gap-3", wide && "sm:grid-cols-4")}>
        {parts.map((p) => {
          const tried = p.band !== null;
          return (
            <li key={p.part} className="flex flex-col rounded-tile bg-well p-3">
              <h3 className="text-caption font-semibold text-fg">{p.part}</h3>
              <p className="truncate text-caption text-fg-muted">{p.name}</p>
              <p className="mt-3 text-title font-medium tracking-[-0.01em] text-fg">{tried ? `Band ${p.band}` : "No band"}</p>
              <p className="text-label text-fg-muted">{p.recommendation ?? p.bandLabel ?? "Not tried yet"}</p>
              <div className="mt-auto pt-3">
                <PillButton
                  href={p.href}
                  variant={p.recommendation ? "primary" : "light"}
                  size="sm"
                  label={`${tried ? "Practise" : "Start"} ${p.part}`}
                >
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

const ATTEMPT_COLUMNS = "grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1.6fr)_1fr_0.9fr_0.8fr]";

export function RecentAttemptsCard({ flags, className }: { flags: FeatureFlags; className?: string }) {
  return (
    <Card aria-labelledby="attempts-title" className={cx("flex flex-col", className)}>
      <CardHeader
        id="attempts-title"
        title="Recent attempts"
        action={
          flags.history ? (
            <ComingSoonButton label="See all attempts" className={styles.SMALL_ACTION}>
              See all
            </ComingSoonButton>
          ) : undefined
        }
      />
      <ul className="-my-1 flex flex-1 flex-col justify-around">
        {RECENT_ATTEMPTS.map((a) => (
          <ListRow
            key={a.task + a.date}
            thumb={
              <Thumb tone={a.tone} size={30}>
                <Icon name="mic" size={14} />
              </Thumb>
            }
            title={a.task}
            subtitle={
              <>
                {a.part}
                <span className="sm:hidden"> · {a.date}</span>
              </>
            }
            columns={ATTEMPT_COLUMNS}
            menu={flags.attemptMenu ? <ComingSoonMenu label={`Options for ${a.task}`} items={ATTEMPT_MENU_ITEMS} /> : undefined}
            cells={[
              {
                content: a.level === null ? <ScoringLabel /> : <span className="text-body font-semibold">{a.level}</span>,
                className: "justify-self-end sm:justify-self-auto",
              },
              {
                phone: false,
                content: (
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <Icon name="clock" size={14} className="text-fg-subtle" />
                    {a.time}
                  </span>
                ),
              },
              { phone: false, content: a.date },
            ]}
          />
        ))}
      </ul>
    </Card>
  );
}

export function BiggestFixCard({ className }: { className?: string }) {
  return (
    <Card aria-labelledby="fix-title" className={cx("flex flex-col", className)}>
      <CardHeader id="fix-title" title="Biggest fix" />
      <p className="text-caption text-fg-muted">
        {BIGGEST_FIX.feature} · {BIGGEST_FIX.task}
      </p>
      <blockquote className="mt-2 border-l-2 border-accent pl-3 text-body text-fg">“{BIGGEST_FIX.quote}”</blockquote>
      <p className="mt-4 text-caption text-fg-muted">Try instead</p>
      <p className="mt-1 text-body font-medium text-fg">{BIGGEST_FIX.fix}</p>
      <div className="mt-5 border-t border-line pt-4">
        <div className="mb-2 flex items-center justify-between text-label">
          <span className="text-fg-muted">
            Still in {BIGGEST_FIX.stillIn} of your last {BIGGEST_FIX.lastAnswers} answers
          </span>
          <span className="font-semibold">
            {BIGGEST_FIX.stillIn}/{BIGGEST_FIX.lastAnswers}
          </span>
        </div>
        <ProgressBar
          value={BIGGEST_FIX.stillIn / BIGGEST_FIX.lastAnswers}
          label={`Mistake still in ${BIGGEST_FIX.stillIn} of your last ${BIGGEST_FIX.lastAnswers} answers`}
        />
      </div>
      <div className="mt-auto pt-5">
        <PillButton href={BIGGEST_FIX.retryHref} icon="retry" variant="quiet" className="w-full">
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
