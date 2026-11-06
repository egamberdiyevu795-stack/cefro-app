import Link from "next/link";
import { Card, CardHeader, Icon, PillButton, ScoringLabel, Thumb, cx, styles } from "@/components/ds";
import { FIRST_VISIT } from "@/features/dashboard/mock-data";
import type { BandChart, FilterOption, HistoryRow, HistoryView } from "./view-model";

/*
 * The History page (`/history`), on the design system. Server-rendered: the filter and "Show more" are links, so the
 * page works without JavaScript and a filtered view has its own address.
 *
 * Desktop: [filter] then [Your attempts] | [Band over time]. Phone: filter, chart, list.
 * No black button except the empty state's "Start your first practice".
 */
export function HistoryContent({ view }: { view: HistoryView }) {
  if (view.total === 0) return <EmptyHistory />;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.44fr)] lg:items-start">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 lg:col-span-2">
        <h1 className="text-title font-medium tracking-[-0.01em] text-fg">History</h1>
        <PartFilter options={view.filters} />
      </div>
      {view.chart && <BandChartCard chart={view.chart} className="lg:col-start-2 lg:row-start-2" />}
      <AttemptsCard view={view} className={cx("lg:col-start-1 lg:row-start-2", !view.chart && "lg:col-span-2")} />
    </div>
  );
}

/** "All" and each part the student has tried. Links, so each filtered view has its own address. */
export function PartFilter({ options }: { options: readonly FilterOption[] }) {
  return (
    <nav aria-label="Filter by part">
      <ul className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <li key={o.id}>
            <Link
              href={o.href}
              aria-current={o.active ? "true" : undefined}
              scroll={false}
              className={cx(
                "inline-flex h-8 items-center gap-1 rounded-full px-3 text-label transition-colors",
                styles.FOCUS_RING,
                o.active ? "bg-card font-semibold text-fg shadow-card" : "text-fg-muted hover:bg-well hover:text-fg",
              )}
            >
              {o.active && <Icon name="check" size={14} />}
              {o.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function AttemptsCard({ view, className }: { view: HistoryView; className?: string }) {
  const count = `${view.matching} ${view.matching === 1 ? "attempt" : "attempts"}`;
  return (
    <Card aria-labelledby="history-title" className={className}>
      <CardHeader id="history-title" title="Your attempts" action={<span className="text-label text-fg-muted">{count}</span>} />
      <ul className="-my-1">
        {view.rows.map((row, i) => (
          <AttemptRow key={row.id} row={row} tone={((i % 4) + 1) as 1 | 2 | 3 | 4} />
        ))}
      </ul>
      {view.moreHref && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <span className="text-label text-fg-muted">
            Showing {view.rows.length} of {view.matching}
          </span>
          <PillButton href={view.moreHref} variant="quiet" size="sm">
            Show more
          </PillButton>
        </div>
      )}
    </Card>
  );
}

const ROW_COLUMNS = "grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_5.5rem]";

/**
 * One attempt. The whole row opens its result page. Phone: title, "Part 2 · date", the retry line; the level on the
 * right with its band under it. Wider: the date gets its own column.
 */
export function AttemptRow({ row, tone, menu }: { row: HistoryRow; tone: 1 | 2 | 3 | 4; menu?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1">
      <Link
        href={row.href}
        className={cx("-mx-2 flex min-w-0 flex-1 items-center gap-3 rounded-tile px-2 py-2.5 transition-colors hover:bg-well", styles.FOCUS_RING)}
      >
        <Thumb tone={tone} size={30}>
          <Icon name={row.retry ? "retry" : "mic"} size={14} />
        </Thumb>
        <span className={cx("grid min-w-0 flex-1 items-center gap-x-4 gap-y-1", ROW_COLUMNS)}>
          <span className="min-w-0">
            <span className="block text-body font-semibold text-fg sm:truncate">{row.title}</span>
            <span className="block text-caption text-fg-muted">
              {row.partLabel ?? "Practice"}
              <span className="sm:hidden"> · {row.date}</span>
            </span>
            {row.retry && <RetryLine goal={row.retry.goal} />}
          </span>
          <Outcome row={row} />
          <span className="hidden text-label text-fg-muted sm:block sm:text-right">{row.date}</span>
        </span>
      </Link>
      {menu}
    </li>
  );
}

/** "Retry", then "Goal met" (check) or "Not yet" (half circle) once the retry is scored. Never colour alone. */
function RetryLine({ goal }: { goal: "Goal met" | "Not yet" | null }) {
  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-fg-muted">
      <span className="rounded-full bg-well px-2 font-medium text-fg">Retry</span>
      {goal && (
        <span className="inline-flex items-center gap-1 text-fg">
          <Icon name={goal === "Goal met" ? "check" : "partly"} size={12} className="text-fg-subtle" />
          {goal}
        </span>
      )}
    </span>
  );
}

function Outcome({ row }: { row: HistoryRow }) {
  const { outcome } = row;
  if (outcome.kind === "scoring") return <ScoringLabel className="justify-self-end sm:justify-self-start" />;
  if (outcome.kind === "not_scored") return <span className="justify-self-end text-label text-fg-muted sm:justify-self-start">Not scored</span>;
  return (
    <span className="justify-self-end text-right sm:justify-self-start sm:text-left">
      <span className="block text-body font-semibold text-fg">{outcome.level}</span>
      <span className="block whitespace-nowrap text-caption text-fg-muted">
        Band {outcome.band} · {outcome.bandLabel}
      </span>
    </span>
  );
}

/**
 * Band over time for one part: one accent line, a dashed target line, the bands as a quiet scale. Text is HTML (so it
 * never scales below 11 px); only the line is SVG. Hovering a point shows its date and band; screen readers get a
 * table of every point.
 */
export function BandChartCard({ chart, className }: { chart: BandChart; className?: string }) {
  const { points, bandMax, targetBand } = chart;
  const bands = Array.from({ length: bandMax + 1 }, (_, i) => bandMax - i);
  const y = (band: number) => (1 - band / bandMax) * 100;
  const x = (i: number) => (points.length === 1 ? 50 : (i / (points.length - 1)) * 100);
  const latest = points[points.length - 1];
  const targetLabel = `Target · Band ${targetBand}`;

  return (
    <Card aria-labelledby="chart-title" className={className}>
      <CardHeader id="chart-title" title="Band over time" action={<span className="text-label text-fg-muted">{chart.partLabel}</span>} />
      <p className="text-caption text-fg-muted">Latest</p>
      <p className="mt-0.5 text-body text-fg">
        <span className="font-semibold">Band {latest.band}</span> · {latest.label}
        <span className="text-fg-muted"> · target Band {targetBand}</span>
      </p>

      <figure className="mt-5" aria-labelledby="chart-caption">
        <figcaption id="chart-caption" className="sr-only">
          {chart.partLabel}: band of each scored attempt, oldest first, out of {bandMax}. {targetLabel}.
        </figcaption>
        <div aria-hidden="true" className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-2">
          {/* Band scale */}
          <div className="relative h-44">
            {bands.map((b) => (
              <span key={b} className="absolute right-0 -translate-y-1/2 text-caption text-fg-muted" style={{ top: `${y(b)}%` }}>
                {b}
              </span>
            ))}
          </div>
          {/* Plot */}
          <div className="relative h-44">
            {bands.map((b) => (
              <span key={b} className="absolute inset-x-0 border-t border-line" style={{ top: `${y(b)}%` }} />
            ))}
            <span className="absolute inset-x-0 border-t-2 border-dashed border-fg-muted" style={{ top: `${y(targetBand)}%` }} />
            <div className="absolute inset-x-3 inset-y-0">
              <svg className="absolute inset-0 size-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none">
                <polyline
                  points={points.map((p, i) => `${x(i)},${y(p.band)}`).join(" ")}
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              {points.map((p, i) => (
                <span
                  key={p.id}
                  className="group absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                  style={{ left: `${x(i)}%`, top: `${y(p.band)}%` }}
                >
                  <span className="size-2.5 rounded-full border-2 border-card bg-accent" />
                  <span
                    className={cx(
                      "pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-tile border border-line bg-card px-2 py-1 text-caption text-fg shadow-card group-hover:block",
                      i === 0 ? "left-0" : i === points.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2",
                    )}
                  >
                    {p.date} · Band {p.band} · {p.label}
                  </span>
                </span>
              ))}
            </div>
          </div>
          {/* Dates: first and last */}
          <span />
          <div className="mt-2 flex justify-between text-caption text-fg-muted">
            <span>{points[0].date}</span>
            {points.length > 1 && <span>{latest.date}</span>}
          </div>
        </div>
        {/* Key: the target is a dashed line, named here so it never sits on top of the band line. */}
        <div aria-hidden="true" className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-fg-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full bg-accent" />
            Your band
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-fg-muted" />
            {targetLabel}
          </span>
        </div>
        <table className="sr-only">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Band</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.id}>
                <td>{p.date}</td>
                <td>
                  Band {p.band} · {p.label}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </figure>
      {chart.olderHidden > 0 && <p className="mt-3 text-caption text-fg-muted">Your last {points.length} scored attempts.</p>}
    </Card>
  );
}

/** No attempts yet: one line of what the page will show, and the screen's one black action. */
export function EmptyHistory() {
  return (
    <div className="grid grid-cols-1 gap-4">
      <h1 className="text-title font-medium tracking-[-0.01em] text-fg">History</h1>
      <Card aria-labelledby="empty-title" className="flex flex-col items-start">
        <h2 id="empty-title" className="text-stat font-light tracking-[-0.03em] text-fg">
          No attempts yet
        </h2>
        <p className="mt-3 max-w-md text-body text-fg-muted">
          Every answer you record is listed here, with your level and band, so you can see how you are getting on.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <PillButton href={FIRST_VISIT.href}>Start your first practice</PillButton>
          <span className="text-label text-fg-muted">About {FIRST_VISIT.minutes} min</span>
        </div>
      </Card>
    </div>
  );
}
