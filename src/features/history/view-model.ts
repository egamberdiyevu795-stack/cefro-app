/**
 * The History page's view model: turns the student's own attempts (`HistoryAttempt`, newest first) into the list,
 * the part filter, the band-over-time chart and the "Show more" step. Pure and browser-safe; also feeds the
 * dashboard's Recent attempts, so both show the same rows.
 */
import { EXAM_PART_IDS, examPartLabel, isExamPartId, type ExamPartId } from "@/domain/speaking/exam-part";
import type { HistoryAttempt } from "@/domain/speaking/history";
import { GOAL_LABEL, goalOutcomeOf } from "@/features/result/view-model";

/** Rows shown at first; each "Show more" adds this many. */
export const PAGE_SIZE = 20;
/** The chart needs at least this many scored attempts of the part; below that it is hidden. */
export const CHART_MIN_POINTS = 3;
/** At most this many points, the latest ones. */
export const CHART_MAX_POINTS = 20;
/** Dates are shown in the exam's time zone (Uzbekistan), the same for every reader. */
const TIME_ZONE = "Asia/Tashkent";

export type HistoryFilter = "all" | ExamPartId;

/** What a row shows where the level goes. There is no Passed/Failed: only a level, "Scoring…" or "Not scored". */
export type RowOutcome =
  | { kind: "scored"; level: string; band: number; bandLabel: string }
  | { kind: "scoring" }
  | { kind: "not_scored" };

export interface HistoryRow {
  id: string;
  href: string;
  title: string;
  /** "Part 2", or null for a task outside the exam's parts. */
  partLabel: string | null;
  /** dd.mm.yy */
  date: string;
  createdAt: string;
  durationMs: number;
  outcome: RowOutcome;
  /** A retry of an earlier attempt: whether it met the goal it was given ("Goal met" / "Not yet"), once scored. */
  retry: { goal: "Goal met" | "Not yet" | null } | null;
}

export interface FilterOption {
  id: HistoryFilter;
  label: string;
  href: string;
  active: boolean;
}

export interface ChartPoint {
  id: string;
  date: string;
  band: number;
  label: string;
}

export interface BandChart {
  part: ExamPartId;
  partLabel: string;
  bandMax: number;
  targetBand: number;
  /** Oldest first: the latest CHART_MAX_POINTS scored attempts. */
  points: ChartPoint[];
  /** Older scored attempts left off the chart (so it stays readable on a phone). */
  olderHidden: number;
}

export interface HistoryView {
  /** All of the student's attempts (before the filter). 0 = the empty state. */
  total: number;
  filter: HistoryFilter;
  /** "All" and each part the student has tried, in exam order. */
  filters: FilterOption[];
  /** Attempts that match the filter. */
  matching: number;
  rows: HistoryRow[];
  /** Link that shows the next PAGE_SIZE rows, or null when every matching row is shown. */
  moreHref: string | null;
  /** Band over time for the selected part (or the latest attempt's part under "All"); null below CHART_MIN_POINTS. */
  chart: BandChart | null;
}

/** Reads `?part=` and `?show=` (untrusted query values). */
export function parseHistoryQuery(query: Record<string, string | string[] | undefined>): { filter: HistoryFilter; show: number } {
  const part = typeof query.part === "string" ? query.part : undefined;
  const requested = typeof query.show === "string" ? Number.parseInt(query.show, 10) : NaN;
  const show = Number.isFinite(requested) && requested > PAGE_SIZE ? Math.ceil(requested / PAGE_SIZE) * PAGE_SIZE : PAGE_SIZE;
  return { filter: isExamPartId(part) ? part : "all", show: Math.min(show, 10_000) };
}

export function historyHref(filter: HistoryFilter, show = PAGE_SIZE): string {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("part", filter);
  if (show > PAGE_SIZE) params.set("show", String(show));
  const query = params.toString();
  return query ? `/history?${query}` : "/history";
}

export function buildHistoryView(attempts: readonly HistoryAttempt[], options: { filter: HistoryFilter; show: number }): HistoryView {
  const tried = new Set(attempts.flatMap((a) => (a.part ? [a.part] : [])));
  // A part the student has not tried (an old link, a typed URL) shows everything instead of an empty list.
  const filter: HistoryFilter = options.filter !== "all" && tried.has(options.filter) ? options.filter : "all";
  const filters: FilterOption[] = [
    { id: "all", label: "All", href: historyHref("all"), active: filter === "all" },
    ...EXAM_PART_IDS.filter((p) => tried.has(p)).map((p) => ({ id: p, label: examPartLabel(p), href: historyHref(p), active: filter === p })),
  ];

  const matching = filter === "all" ? attempts : attempts.filter((a) => a.part === filter);
  const rows = toHistoryRows(matching.slice(0, options.show), attempts);
  const moreHref = matching.length > options.show ? historyHref(filter, options.show + PAGE_SIZE) : null;

  const chartPart = filter !== "all" ? filter : (attempts.find((a) => a.part)?.part ?? null);
  return {
    total: attempts.length,
    filter,
    filters,
    matching: matching.length,
    rows,
    moreHref,
    chart: chartPart ? bandChart(attempts, chartPart) : null,
  };
}

/** Rows for some of the attempts. `all` = every attempt of the student, to find the attempt a retry came from. */
export function toHistoryRows(attempts: readonly HistoryAttempt[], all: readonly HistoryAttempt[] = attempts): HistoryRow[] {
  const byId = new Map(all.map((a) => [a.id, a]));
  return attempts.map((a) => {
    const previous = a.previousAttemptId ? byId.get(a.previousAttemptId) : undefined;
    return {
      id: a.id,
      href: `/result/${a.id}`,
      title: a.title,
      partLabel: a.part ? examPartLabel(a.part) : null,
      date: formatDate(a.createdAt),
      createdAt: a.createdAt,
      durationMs: a.recordingDurationMs,
      outcome: outcomeOf(a),
      retry: a.previousAttemptId ? { goal: goalOf(previous, a) } : null,
    };
  });
}

function outcomeOf(a: HistoryAttempt): RowOutcome {
  if (a.status !== "completed" && a.status !== "failed" && !a.isStalled) return { kind: "scoring" };
  const scoring = scoredBand(a);
  return scoring ? { kind: "scored", level: levelOfBand(scoring.label), band: scoring.band, bandLabel: scoring.label } : { kind: "not_scored" };
}

/** The band of a scored attempt. "Too short to rate" is band 0 but not a rating, so it is not scored (as on the result page). */
function scoredBand(a: HistoryAttempt) {
  if (a.status !== "completed" || !a.result) return null;
  return a.result.scoring.zero_reason === "too_short" ? null : a.result.scoring;
}

function goalOf(previous: HistoryAttempt | undefined, current: HistoryAttempt): "Goal met" | "Not yet" | null {
  if (!previous?.result || !scoredBand(current)) return null;
  const goal = goalOutcomeOf(previous.result, current.result!);
  return goal ? GOAL_LABEL[goal] : null;
}

/**
 * The CEFR level a band stands for, from the band's own label: "Higher B1" → "B1", "Lower B2" → "B2"; "Above B2" and
 * "Below B1" stay as they are. So a list shows the level as its main value and the band beside it.
 */
export function levelOfBand(label: string): string {
  return label.replace(/^(Lower|Higher)\s+/, "");
}

function bandChart(attempts: readonly HistoryAttempt[], part: ExamPartId): BandChart | null {
  const scored = attempts.filter((a) => a.part === part && scoredBand(a)).reverse(); // oldest first
  if (scored.length < CHART_MIN_POINTS) return null;
  const latest = scored[scored.length - 1].result!.scoring;
  const shown = scored.slice(-CHART_MAX_POINTS);
  return {
    part,
    partLabel: examPartLabel(part),
    bandMax: latest.band_max,
    targetBand: latest.target_band,
    olderHidden: scored.length - shown.length,
    points: shown.map((a) => ({ id: a.id, date: formatDate(a.createdAt), band: a.result!.scoring.band, label: a.result!.scoring.label })),
  };
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "2-digit" });

/** "04.11.26", as on the dashboard. */
export function formatDate(iso: string): string {
  const parts = Object.fromEntries(DATE_FORMAT.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.day}.${parts.month}.${parts.year}`;
}
