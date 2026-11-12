"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardHeader, DemoLabel, Icon, PillButton, cx, styles } from "@/components/ds";
import { fetchMockResult } from "@/features/speaking-practice/lib/api-client";
import type { MockResultSource } from "./part-source";
import { buildMockResultView, type FixView, type LevelTile, type MockResultView, type MockRowView } from "./view-model";

/** How often a mock with parts still being scored asks for news. Each poll is one small read of the student's own mock. */
const POLL_MS = 3000;

/**
 * The mock result page (docs/v1-plan.md, step 4; docs/design-system.md, "Mock result"): the speaking-only estimate with its
 * line and, beside it, the teacher's level when there is one; one row per part that fills in when scored; the biggest fix
 * across the mock. While a part is still being scored the page asks the server again every few seconds (real mocks only: the
 * demo has nothing to wait for). One black button: "Retry with this goal", else "Back to Practice".
 */
export function MockResult({ initial, demo = false, practiceHref }: { initial: MockResultSource; demo?: boolean; practiceHref: string }) {
  const [source, setSource] = useState(initial);
  const view = buildMockResultView(source);
  const waiting = view.scoring && !demo;

  useEffect(() => {
    if (!waiting) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const { result } = await fetchMockResult(source.id);
        if (cancelled) return;
        setSource(result);
        if (!result.parts.some((p) => p.state === "scoring")) return;
      } catch {
        // A blip: ask again. The rows already on screen stay.
      }
      if (!cancelled) timer = setTimeout(() => void poll(), POLL_MS);
    };
    timer = setTimeout(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [waiting, source.id]);

  const hasRetry = Boolean(view.fix?.retryHref);
  return (
    <div className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start" data-testid="mock-result" data-status={view.status}>
      {demo && <DemoLabel variant="result" className="w-fit bg-card lg:col-span-2" />}
      <div className="grid gap-4">
        <LevelCard view={view} />
        <PartsCard rows={view.rows} />
      </div>
      <div className="grid gap-4">
        <FixCard view={view} />
        <div className="flex">
          <PillButton href={practiceHref} variant={hasRetry ? "quiet" : "primary"} size="lg" className="w-full sm:w-auto">
            Back to Practice
          </PillButton>
        </div>
      </div>
    </div>
  );
}

/** "CEFRO: B2" and, when a teacher rated, "Your teacher: B2" beside it. Never one instead of the other. */
function LevelCard({ view }: { view: MockResultView }) {
  const { headline } = view;
  return (
    <Card aria-labelledby="mock-result-title" data-testid="mock-level">
      <p className="text-label font-medium text-fg-muted">
        {view.title}
        {view.placeText && (
          <span data-testid="mock-place">
            {" · "}
            {view.placeText}
          </span>
        )}
      </p>
      <h1 id="mock-result-title" className="mt-1 text-title font-medium tracking-[-0.01em] text-fg">
        {headline.kind === "level" ? "Your estimated speaking level" : headline.title}
      </h1>
      {view.notFinishedNote && (
        <p className="mt-3 text-body text-fg" data-testid="mock-not-finished">
          {view.notFinishedNote}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-end gap-x-8 gap-y-3" data-testid="mock-levels">
        {view.levels.map((tile) => (
          <Tile key={tile.name} tile={tile} />
        ))}
      </div>
      {headline.kind === "not_ready" && (
        <p className="mt-3 text-body text-fg-muted" data-testid="mock-not-ready">
          {headline.reason}
        </p>
      )}
      <p className="mt-4 text-body text-fg" data-testid="mock-line">
        {view.line}
      </p>
    </Card>
  );
}

function Tile({ tile }: { tile: LevelTile }) {
  const testId = tile.name === "CEFRO" ? "level-cefro" : "level-teacher";
  return (
    <p className="flex items-baseline gap-2" data-testid={testId}>
      <span className="text-label font-medium text-fg-muted">{tile.name}:</span>{" "}
      {tile.value ? (
        <span className="text-stat font-light tracking-[-0.03em] text-fg">{tile.value}</span>
      ) : (
        <span className="text-lead font-medium text-fg">Estimate not ready yet</span>
      )}
    </p>
  );
}

function PartsCard({ rows }: { rows: readonly MockRowView[] }) {
  return (
    <Card aria-labelledby="mock-parts-title">
      <CardHeader id="mock-parts-title" title="Your four parts" />
      <ul className="-my-1 divide-y divide-line" aria-live="polite" data-testid="mock-parts">
        {rows.map((row) => (
          <PartRow key={row.part} row={row} />
        ))}
      </ul>
    </Card>
  );
}

function PartRow({ row }: { row: MockRowView }) {
  const open = row.detailHref !== null && (row.state === "scored" || row.state === "not_scored");
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-body font-semibold text-fg">
          {row.partLabel} · {row.name}
        </span>
        {row.taskTitle && <span className="block truncate text-caption text-fg-muted">{row.taskTitle}</span>}
        {row.teacherLevel && (
          <span className="block text-caption text-fg" data-testid="part-teacher">
            Your teacher: {row.teacherLevel}
          </span>
        )}
      </span>
      {row.cefro ? (
        <span className="shrink-0 text-right" data-testid="part-level">
          <span className="block text-body font-semibold text-fg">{row.cefro.level}</span>
          <span className="block whitespace-nowrap text-caption text-fg-muted">{row.cefro.bandText}</span>
        </span>
      ) : (
        <span className="inline-flex shrink-0 items-center gap-1.5 text-label text-fg" data-testid="part-status">
          {row.state === "scoring" && <Icon name="scoring" size={14} className="text-fg-subtle" />}
          {row.status}
        </span>
      )}
      {open && (
        <>
          <span className="shrink-0 text-label font-medium text-fg">See details</span>
          <Icon name="chevronDown" size={16} className="-rotate-90 shrink-0 text-fg-subtle" />
        </>
      )}
    </>
  );
  return (
    <li data-part={row.part} data-state={row.state}>
      {open ? (
        <Link
          href={row.detailHref!}
          aria-label={`See details: ${row.partLabel}`}
          className={cx("-mx-2 flex min-h-14 items-center gap-3 rounded-tile px-2 py-2.5 transition-colors hover:bg-well", styles.FOCUS_RING)}
          data-testid="part-details"
        >
          {body}
        </Link>
      ) : (
        <div className="flex min-h-14 items-center gap-3 py-2.5">{body}</div>
      )}
    </li>
  );
}

/** The weakest part's biggest fix, with its retry and its lesson where they exist. The retry is the page's one black button. */
function FixCard({ view }: { view: MockResultView }) {
  const { fix } = view;
  return (
    <Card aria-labelledby="mock-fix-title" data-testid="mock-fix">
      <CardHeader id="mock-fix-title" title="Biggest fix across the mock" />
      {fix ? <Fix fix={fix} /> : <p className="text-body text-fg-muted">{view.fixWaiting ? "Your biggest fix appears when every part is scored." : "No part was scored, so there is no fix to show yet."}</p>}
    </Card>
  );
}

function Fix({ fix }: { fix: FixView }) {
  const view = fix.fix;
  return (
    <div>
      <p className="text-caption font-semibold text-fg-muted">
        {fix.partLabel} · {view.label}
      </p>
      {view.quote && (
        <>
          <p className="mt-3 text-caption font-semibold text-fg">{view.quoteLabel}</p>
          <blockquote className="mt-1 border-l-2 border-line pl-3 text-body text-fg">{view.quote}</blockquote>
        </>
      )}
      <p className="mt-3 text-caption font-semibold text-fg">{view.adviceLabel}</p>
      <p className="mt-1 text-body text-fg">{view.tryInstead}</p>
      {view.goal && (
        <>
          <p className="mt-3 text-caption font-semibold text-fg">Goal for your retry</p>
          <p className="mt-1 text-body text-fg">{view.goal}</p>
        </>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        {fix.retryHref && (
          <PillButton href={fix.retryHref} icon="retry" className="w-full sm:w-auto">
            Retry with this goal
          </PillButton>
        )}
        {fix.lesson && (
          <PillButton href={fix.lesson.href} variant="quiet" icon="book" className="w-full sm:w-auto" label={`Learn how: ${fix.lesson.title}`}>
            Learn how
          </PillButton>
        )}
      </div>
    </div>
  );
}
