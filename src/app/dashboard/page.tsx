import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CardHeader,
  DeltaLabel,
  GoalBar,
  Icon,
  IconButton,
  ListRow,
  PillButton,
  ProgressBar,
  RadarChart,
  Sidebar,
  StatRow,
  ScoringLabel,
  Thumb,
  TopBar,
  TopBarLink,
} from "@/components/ds";
import { BIGGEST_FIX, EXAM_PARTS, NAV_ITEMS, PROGRESS, RADAR_AXES, RADAR_RINGS, RECENT_ATTEMPTS } from "@/features/dashboard/mock-data";

export const metadata: Metadata = { title: "Dashboard" };

/*
 * Design prototype: every value on this page is mocked (see features/dashboard/mock-data.ts).
 *
 * Desktop grid (like the reference): wide left column, narrow right column.
 *   row 1: [ Speaking progress + radar ] [ Exam parts ]
 *   row 2: [ Recent attempts           ] [ Biggest fix ]
 * Phone: one column in this order: progress, biggest fix, radar, recent attempts, exam parts.
 * The progress card is `display: contents` on phones so its two halves become separate cards that can be reordered.
 */

const ATTEMPT_COLUMNS = "grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1.6fr)_1fr_0.9fr_0.8fr]";

/** Blocks that are their own card on phones and plain halves inside the progress card on desktop. */
const SPLIT_HALF = "rounded-card bg-card p-5 shadow-card lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none";

export default function DashboardPage() {
  return (
    <div className="min-h-dvh bg-page font-ui text-fg lg:p-6">
      <div className="mx-auto flex max-w-[1280px] gap-6 px-4 pt-4 lg:rounded-shell lg:bg-shell lg:p-6 lg:shadow-card">
        <aside className="lg:flex lg:w-12 lg:shrink-0 lg:flex-col lg:items-center lg:gap-14">
          <Wordmark className="hidden lg:flex lg:h-12" />
          <Sidebar items={NAV_ITEMS} activeHref="/dashboard" />
        </aside>

        <div className="min-w-0 flex-1">
          <header className="mb-4 flex flex-col gap-2 lg:mb-5">
            <div className="flex items-center justify-between lg:hidden">
              <Wordmark />
              <IconButton icon="bell" label="Notifications" />
            </div>
            <TopBar
              searchPlaceholder="Search tasks and lessons…"
              actions={
                <>
                  <TopBarLink href="/" icon="layers">
                    All tasks
                  </TopBarLink>
                  <span aria-hidden="true" className="hidden h-4 w-px bg-line sm:block" />
                  <TopBarLink href="/practice/speaking/b2-part2-advice-from-someone" icon="calendar">
                    Mock exam
                  </TopBarLink>
                  <span className="hidden lg:block">
                    <IconButton icon="bell" label="Notifications" />
                  </span>
                </>
              }
            />
          </header>

          <main id="main" className="grid grid-cols-1 gap-4 pb-28 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.44fr)] lg:pb-0">
            {/* Speaking progress + radar: one card on desktop, two on phones. */}
            <section
              aria-labelledby="progress-title"
              className="contents lg:col-start-1 lg:row-start-1 lg:grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] lg:content-start lg:gap-x-8 lg:rounded-card lg:bg-card lg:p-6 lg:shadow-card"
            >
              <CardHeader
                id="progress-title"
                title="Speaking progress"
                className="hidden lg:col-span-2 lg:flex"
                action={<PeriodPicker />}
              />

              <div className={`order-1 lg:order-none ${SPLIT_HALF}`}>
                <CardHeader title="Speaking progress" className="lg:hidden" action={<PeriodPicker />} />
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

              <div className={`order-3 lg:order-none lg:self-center ${SPLIT_HALF}`}>
                <CardHeader title="Skills by level" className="lg:hidden" />
                <div className="mx-auto max-w-[24rem] lg:max-w-none">
                  <RadarChart axes={RADAR_AXES} rings={RADAR_RINGS} label="Your level in each skill" />
                </div>
              </div>
            </section>

            <Card aria-labelledby="parts-title" className="order-5 lg:order-none lg:col-start-2 lg:row-start-1">
              <CardHeader id="parts-title" title="Exam parts" action={<IconButton icon="more" label="Exam parts options" size={28} />} />
              <ul className="grid grid-cols-2 gap-3">
                {EXAM_PARTS.map((p) => (
                  <li key={p.part} className="flex flex-col rounded-tile bg-well p-3">
                    <h3 className="text-caption font-semibold text-fg">{p.part}</h3>
                    <p className="truncate text-caption text-fg-muted">{p.name}</p>
                    <p className="mt-3 text-title font-medium tracking-[-0.01em] text-fg">{p.band === null ? "No band" : `Band ${p.band}`}</p>
                    <p className="text-label text-fg-muted">{p.bandLabel ?? "Not tried yet"}</p>
                    <div className="mt-3">
                      <PillButton href={p.href} variant="light" size="sm" label={`${p.band === null ? "Start" : "Practise"} ${p.part}`}>
                        {p.band === null ? "Start" : "Practise"}
                      </PillButton>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            <Card aria-labelledby="attempts-title" className="order-4 flex flex-col lg:order-none lg:col-start-1 lg:row-start-2">
              <CardHeader
                id="attempts-title"
                title="Recent attempts"
                action={
                  <Link href="/dashboard#tests" className="text-label text-fg-muted hover:text-fg">
                    See all
                  </Link>
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
                    menuLabel={`Options for ${a.task}`}
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

            <Card aria-labelledby="fix-title" className="order-2 flex flex-col lg:order-none lg:col-start-2 lg:row-start-2">
              <CardHeader id="fix-title" title="Biggest fix" action={<IconButton icon="more" label="Biggest fix options" size={28} />} />
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
                <PillButton href={BIGGEST_FIX.retryHref} icon="retry" className="w-full">
                  Start retry
                </PillButton>
              </div>
            </Card>
          </main>
        </div>
      </div>
    </div>
  );
}

function Wordmark({ className = "flex" }: { className?: string }) {
  return (
    <Link href="/dashboard" className={`items-center text-body font-semibold tracking-[0.08em] text-fg ${className}`}>
      CEFRO
    </Link>
  );
}

function PeriodPicker() {
  return (
    <button type="button" className="inline-flex items-center gap-1 text-label text-fg-muted hover:text-fg">
      Last 30 days
      <Icon name="chevronDown" size={14} />
    </button>
  );
}
