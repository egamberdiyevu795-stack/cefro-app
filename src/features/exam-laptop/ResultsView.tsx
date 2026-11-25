"use client";

import { useState } from "react";
import { Card, CardHeader, PillButton, cx, styles } from "@/components/ds";
import type { CommonProblem } from "@/features/teacher/view-model";
import { teacherHref, teacherLinks } from "@/features/teacher/links";
import { CommonProblemsCard } from "@/features/teacher/sections";
import { finishedText, firstUnrated, sortByLevel, type ResultRow, type SortDirection } from "./results-view";

/**
 * T8 Class mock: results (docs/v1-plan.md section 5). One row per student: name, level, the four part bands, and a quiet "Listen"
 * to T6. Sorted by level (a small grey control flips it), the common problems of this mock, and the page's one black button,
 * "Open first unrated" (the first row, in the order shown, with something to rate and no rating). Built from what the teacher
 * may already read; no PIN, hash or email.
 */
export function ResultsView({
  title,
  className,
  date,
  closed,
  rows,
  problems,
  classId,
  mock,
}: {
  title: string;
  className: string;
  date: string;
  closed: boolean;
  rows: readonly ResultRow[];
  problems: readonly CommonProblem[];
  classId: string;
  /** Mock mode: links keep `?mock=1&as=teacher`. (Plain data: a page can't hand a function to a client component.) */
  mock: boolean;
}) {
  const link = (href: string) => teacherHref(href, { mock, demoTeacher: mock });
  const mockHref = (mockId: string) => link(teacherLinks.mock(classId, mockId));
  const lessonHref = (slug: string) => link(teacherLinks.lesson(classId, slug));
  const [direction, setDirection] = useState<SortDirection>("high");
  const sorted = sortByLevel(rows, direction);
  const first = firstUnrated(sorted);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.44fr)] lg:items-start" data-testid="class-mock-results">
      <div className="flex flex-wrap items-center justify-between gap-3 lg:col-span-2">
        <div>
          <p className="text-caption text-fg-muted">{className}</p>
          <h1 className="text-title font-medium tracking-[-0.01em] text-fg">
            {title} · {date}
          </h1>
          <p className="mt-0.5 text-label text-fg-muted" data-testid="results-summary">
            {finishedText(rows)}
            {closed ? " · Closed" : ""}
          </p>
        </div>
        {first?.mockId ? (
          <PillButton href={mockHref(first.mockId)} size="lg" icon="play" label={`Open first unrated: ${first.name}`} className="w-full sm:w-auto">
            Open first unrated
          </PillButton>
        ) : (
          <p className="text-body text-fg-muted" data-testid="all-rated">
            Nothing left to rate.
          </p>
        )}
      </div>
      <Card aria-labelledby="results-title" data-testid="results-card" className="lg:col-start-1">
        <CardHeader
          id="results-title"
          title="Students"
          action={
            <button type="button" onClick={() => setDirection((d) => (d === "high" ? "low" : "high"))} className={cx(styles.SMALL_ACTION, "min-h-9 px-2")} data-testid="sort-toggle">
              Sort by level: {direction === "high" ? "highest first" : "lowest first"}
            </button>
          }
        />
        <ul className="-my-1 divide-y divide-line">
          {sorted.map((row) => (
            <li key={row.memberId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4" data-testid="result-row" data-state={row.state}>
              <span className="min-w-0 sm:w-40 sm:shrink-0">
                <span className="block text-body font-semibold text-fg">{row.name}</span>
                <span className="block text-label text-fg" data-testid="result-level">
                  {row.levelText}
                </span>
              </span>
              {/* Not started: just "Not started", not four "Part 1.1 —" cells. */}
              {row.state === "not_started" ? (
                <span className="flex-1" />
              ) : (
              <ul className="flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-1" aria-label={`${row.name}: part bands`}>
                {row.bands.map((b) => (
                  <li key={b.part} className="text-label text-fg-muted">
                    {b.label} <span className="text-fg">{b.text}</span>
                  </li>
                ))}
              </ul>
              )}
              {row.mockId ? (
                <PillButton href={mockHref(row.mockId)} variant="quiet" size="sm" icon="play" label={`Listen: ${row.name}`}>
                  Listen
                </PillButton>
              ) : (
                <span className="text-label text-fg-muted sm:w-16">&nbsp;</span>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <div className="flex flex-col gap-4 lg:col-start-2 lg:row-start-2">
        <CommonProblemsCard problems={problems} lessonHref={lessonHref} />
      </div>
    </div>
  );
}
