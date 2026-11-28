"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Card, cx, styles } from "@/components/ds";
import { useHydrated } from "@/components/ds/useHydrated";
import { examDateProblem, examDateState, formatDay, type ExamDateState } from "@/domain/exam-date";

/** The small text actions here (Edit, Add exam date, Skip, Cancel, Remove date): a 36 px tap area, like Save. */
export const EXAM_TEXT_ACTION = cx(styles.SMALL_ACTION, "min-h-9 min-w-11 justify-end px-1");

/**
 * The exam date on the dashboard (flag `examCountdown`).
 * - "ask": "When is your exam?" with a date picker, Save and Skip.
 * - "ask_again": the saved date has passed: the countdown is gone and the student is asked for the next date.
 * - "countdown": "Your exam: in N days", the date, and Edit (the same picker, with Cancel and Remove date).
 * - "skipped" (Skip, or Remove date): "Your exam · Not set" and a small "Add exam date" that opens the picker.
 * Saved per user (`PUT /api/account/exam-date`), then the page re-renders from the server.
 * Save is the quiet pill: the screen's one black button is elsewhere (Practise next / Start practice).
 *
 * Every control is disabled until the page is ready (`useHydrated`): on a slow connection a date picked before then
 * never reached React's state, and Save tapped then was a plain form submit that reloaded the page and lost the date.
 *
 * `demo` (mock mode): nothing is sent. Save, Skip and Remove date change only what this page shows, and a reload
 * brings the demo date back.
 */
export function ExamDate({
  state: given,
  today,
  max,
  variant,
  demo = false,
  className,
}: {
  state: ExamDateState;
  /** "YYYY-MM-DD" in Uzbekistan: the earliest date that can be chosen. */
  today: string;
  max: string;
  /** "card": its own card (returning dashboard). "inline": a section inside the welcome card. */
  variant: "card" | "inline";
  /** Mock mode: nothing is sent; changes are kept on this page only. */
  demo?: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  // Mock mode: what the student saved on this page, in place of the server's state.
  const [demoState, setDemoState] = useState<ExamDateState | null>(null);
  const state = (demo && demoState) || given;
  const ready = useHydrated();
  let body: React.ReactNode;
  if (state.kind === "countdown" && !editing) {
    body = (
      <Summary title={<span data-testid="exam-countdown">{state.label}</span>} detail={formatDay(state.date)} big>
        <button type="button" disabled={!ready} onClick={() => setEditing(true)} aria-label="Edit exam date" className={EXAM_TEXT_ACTION}>
          Edit
        </button>
      </Summary>
    );
  } else if (state.kind === "skipped" && !editing) {
    body = (
      <Summary title="Not set">
        <button type="button" disabled={!ready} onClick={() => setEditing(true)} className={EXAM_TEXT_ACTION} data-testid="exam-add">
          Add exam date
        </button>
      </Summary>
    );
  } else {
    body = (
      <ExamDateForm
        question={state.kind === "ask_again" ? "When is your next exam?" : state.kind === "countdown" ? "Change your exam date" : "When is your exam?"}
        note={state.kind === "ask_again" ? `Your exam date, ${formatDay(state.passed)}, has passed.` : null}
        initial={state.kind === "countdown" ? state.date : ""}
        today={today}
        max={max}
        // Skip only where the question is asked unprompted; once the student opened the picker, Cancel closes it.
        onCancel={state.kind === "countdown" || state.kind === "skipped" ? () => setEditing(false) : null}
        canRemove={state.kind === "countdown"}
        onSaved={() => setEditing(false)}
        onDemoSave={
          demo
            ? (body) =>
                setDemoState(
                  "date" in body ? examDateState({ examDate: body.date, examDateSkippedAt: null }, new Date()) : { kind: "skipped" },
                )
            : null
        }
      />
    );
  }

  if (variant === "inline") return <div className={className}>{body}</div>;
  return (
    <Card aria-label="Your exam date" className={cx("flex flex-col justify-center", className)}>
      {body}
    </Card>
  );
}

/** "Your exam", a line (the countdown, or "Not set"), an optional detail, and one small action on the right. */
function Summary({ title, detail, big = false, children }: { title: React.ReactNode; detail?: string; big?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-caption text-fg-muted">Your exam</p>
        <p className={cx("mt-0.5", big ? "text-title font-medium tracking-[-0.01em] text-fg" : "text-label text-fg-muted")}>{title}</p>
        {detail && <p className="mt-0.5 text-label text-fg-muted">{detail}</p>}
      </div>
      {children}
    </div>
  );
}

type SaveBody = { date: string } | { skip: true } | { remove: true };

function ExamDateForm({
  question,
  note,
  initial,
  today,
  max,
  onCancel,
  canRemove,
  onSaved,
  onDemoSave,
}: {
  question: string;
  note: string | null;
  initial: string;
  today: string;
  max: string;
  /** Back to the summary. Without it the form offers Skip. */
  onCancel: (() => void) | null;
  /** Edit of a saved date: "Remove date" clears it. */
  canRemove: boolean;
  onSaved: () => void;
  /** Mock mode: called instead of sending anything. */
  onDemoSave: ((body: SaveBody) => void) | null;
}) {
  const router = useRouter();
  const id = useId();
  const [date, setDate] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = useHydrated();

  async function send(body: SaveBody) {
    setError(null);
    if (onDemoSave) {
      // The same rule the server applies (today up to two years ahead), without asking it.
      const problem = "date" in body ? examDateProblem(body.date, new Date()) : null;
      if (problem) setError(problem);
      else {
        onDemoSave(body);
        onSaved();
      }
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/account/exam-date", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(data?.error?.message ?? "That didn't work. Please try again.");
        return;
      }
      onSaved();
      router.refresh();
    } catch {
      setError("That didn't work. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!date) setError("Choose a date.");
        else void send({ date });
      }}
      noValidate
    >
      <label htmlFor={id} className="block text-label text-fg-muted">
        {question}
      </label>
      {note && <p className="mt-0.5 text-caption text-fg-muted">{note}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          id={id}
          type="date"
          value={date}
          min={today}
          max={max}
          disabled={!ready}
          onChange={(event) => setDate(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cx("h-9 min-w-0 rounded-full border border-fg-subtle bg-card px-4 text-body text-fg disabled:cursor-wait", styles.FOCUS_RING)}
        />
        <button type="submit" disabled={busy || !ready} className={cx(styles.PILL_QUIET, "disabled:opacity-60")}>
          Save
        </button>
        {onCancel ? (
          <button type="button" disabled={!ready} onClick={onCancel} className={EXAM_TEXT_ACTION}>
            Cancel
          </button>
        ) : (
          <button type="button" disabled={busy || !ready} onClick={() => void send({ skip: true })} className={EXAM_TEXT_ACTION}>
            Skip
          </button>
        )}
      </div>
      {canRemove && (
        // On its own line, away from Save, so it is not tapped by mistake.
        <button type="button" disabled={busy || !ready} onClick={() => void send({ remove: true })} className={cx(EXAM_TEXT_ACTION, "-ml-1 mt-1")}>
          Remove date
        </button>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-2 text-label text-fg">
          {error}
        </p>
      )}
    </form>
  );
}
