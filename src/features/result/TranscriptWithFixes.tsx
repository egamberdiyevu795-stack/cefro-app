"use client";

import { Fragment, useId, useState } from "react";
import { cx } from "@/components/ds/cx";
import { FOCUS_RING } from "@/components/ds/styles";
import { useHydrated } from "@/components/ds/useHydrated";
import { fixCountText, type FixItem, type TranscriptFixesView, type TranscriptPiece } from "./transcript-fixes";

/**
 * The transcript with the student's mistakes underlined in amber (never red), docs/v1-plan.md §3.3, and the evaluator's
 * strong points ("what you did well") on a soft green fill: a fill, not a line, so it differs from a mistake by shape.
 *
 * A sentence with a mistake is one button: tap it and You said / Better / Why open under it (one open at a time; tap
 * again to close). The count sits above ("6 sentences to improve"). Nothing here is a black button. The sentence
 * buttons wait for the page's scripts like every control (`useHydrated`), and the underline is a line, not only a colour,
 * so it reads without colour too. Words read from the lists (Part 3) keep their dotted underline.
 */

const MARK = "underline decoration-mark decoration-2 underline-offset-4 [text-decoration-skip-ink:none]";

function Piece({ piece }: { piece: TranscriptPiece }) {
  if (piece.fixId !== null) {
    return (
      <span data-testid="fix-mark" className={MARK}>
        {piece.text}
      </span>
    );
  }
  if (piece.good) {
    return (
      <mark data-testid="good-mark" className="rounded-sm bg-good px-0.5 text-fg">
        <span className="sr-only">(strong point) </span>
        {piece.text}
      </mark>
    );
  }
  if (piece.copied) {
    return (
      <mark className="rounded-sm bg-well px-0.5 text-fg underline decoration-dotted underline-offset-4">
        <span className="sr-only">(from the list) </span>
        {piece.text}
      </mark>
    );
  }
  return <>{piece.text}</>;
}

function FixDetail({ item }: { item: FixItem }) {
  return (
    <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-body" data-testid="fix-detail">
      <dt className="text-caption text-fg-muted">You said</dt>
      <dd className="text-fg">“{item.youSaid}”</dd>
      <dt className="text-caption text-fg-muted">Better</dt>
      <dd className="text-fg">
        “
        {item.better.map((part, i) =>
          part.changed ? (
            <strong key={i} className="font-semibold">
              {part.text}
            </strong>
          ) : (
            <Fragment key={i}>{part.text}</Fragment>
          ),
        )}
        ”
      </dd>
      <dt className="text-caption text-fg-muted">Why</dt>
      <dd className="text-fg-muted">{item.why}</dd>
    </dl>
  );
}

export function TranscriptWithFixes({ view }: { view: TranscriptFixesView }) {
  const [open, setOpen] = useState<number | null>(null);
  const hydrated = useHydrated();
  const panelId = useId();
  const items = new Map(view.items.map((item) => [item.id, item]));

  // Units in order; the open unit's panel goes right after it, splitting the paragraph there.
  const groups: { plain: number[]; panelFor: number | null }[] = [{ plain: [], panelFor: null }];
  view.units.forEach((unit, i) => {
    groups.at(-1)!.plain.push(i);
    if (open !== null && i === open) groups.push({ plain: [], panelFor: i }, { plain: [], panelFor: null });
  });

  return (
    <div data-testid="transcript-fixes">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-caption text-fg-muted">Transcript</p>
        <p className="text-label font-medium text-fg" data-testid="fixes-count">
          {fixCountText(view.count)}
        </p>
      </div>
      {view.count > 0 && <p className="mt-1 text-label text-fg-muted">Tap an underlined sentence to see a better version.</p>}
      {(view.goodCount ?? 0) > 0 && (
        <p className="mt-1 flex items-center gap-2 text-label text-fg-muted">
          <span aria-hidden="true" className="inline-block h-3 w-5 rounded-sm bg-good" />
          Green: what you did well. Keep doing it.
        </p>
      )}
      <div className="mt-2 text-body text-fg" data-testid="transcript">
        {groups.map((group, g) =>
          group.panelFor !== null ? (
            <div
              key={g}
              id={`${panelId}-${group.panelFor}`}
              role="region"
              aria-label="Better version"
              data-testid="fix-panel"
              className="my-2 flex flex-col gap-3 rounded-tile bg-well px-3 py-3"
            >
              {view.units[group.panelFor].fixIds.map((id) => (
                <FixDetail key={id} item={items.get(id)!} />
              ))}
            </div>
          ) : group.plain.length > 0 ? (
            <p key={g}>
              {group.plain.map((i) => {
                const unit = view.units[i];
                const pieces = unit.pieces.map((piece, k) => <Piece key={k} piece={piece} />);
                if (unit.fixIds.length === 0) return <Fragment key={i}>{pieces}</Fragment>;
                const isOpen = open === i;
                return (
                  <Fragment key={i}>
                    <button
                      type="button"
                      data-testid="fix-sentence"
                      disabled={!hydrated}
                      aria-expanded={isOpen}
                      aria-controls={isOpen ? `${panelId}-${i}` : undefined}
                      onClick={() => setOpen(isOpen ? null : i)}
                      className={cx(
                        "inline cursor-pointer rounded-sm p-0 text-left align-baseline font-[inherit] text-[length:inherit] leading-[inherit] text-fg disabled:cursor-default disabled:text-fg",
                        isOpen ? "bg-well" : "hover:bg-well",
                        FOCUS_RING,
                      )}
                    >
                      {pieces}
                    </button>
                  </Fragment>
                );
              })}
            </p>
          ) : null,
        )}
      </div>
    </div>
  );
}
