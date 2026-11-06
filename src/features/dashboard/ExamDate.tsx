"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Card, cx, styles } from "@/components/ds";
import { formatDay, type ExamDateState } from "@/domain/exam-date";

/**
 * The exam date on the dashboard (flag `examCountdown`).
 * - "ask": "When is your exam?" with a date picker, Save and Skip.
 * - "ask_again": the saved date has passed: the countdown is gone and the student is asked for the next date.
 * - "countdown": "Your exam: in N days", the date, and Edit (opens the same picker, with Cancel).
 * Saved per user (`PUT /api/account/exam-date`), then the page re-renders from the server.
 * Save is the quiet pill: the screen's one black button is elsewhere (Practise next / Start your first practice).
 */
export function ExamDate({
  state,
  today,
  max,
  variant,
  className,
}: {
  state: Exclude<ExamDateState, { kind: "skipped" }>;
  /** "YYYY-MM-DD" in Uzbekistan: the earliest date that can be chosen. */
  today: string;
  max: string;
  /** "card": its own card (returning dashboard). "inline": a section inside the first-visit card. */
  variant: "card" | "inline";
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const body =
    state.kind === "countdown" && !editing ? (
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-caption text-fg-muted">Your exam</p>
          <p className="mt-0.5 text-title font-medium tracking-[-0.01em] text-fg" data-testid="exam-countdown">
            {state.label}
          </p>
          <p className="mt-0.5 text-label text-fg-muted">{formatDay(state.date)}</p>
        </div>
        <button type="button" onClick={() => setEditing(true)} aria-label="Edit exam date" className={styles.SMALL_ACTION}>
          Edit
        </button>
      </div>
    ) : (
      <ExamDateForm
        question={state.kind === "ask_again" ? "When is your next exam?" : state.kind === "countdown" ? "Change your exam date" : "When is your exam?"}
        note={state.kind === "ask_again" ? `Your exam date, ${formatDay(state.passed)}, has passed.` : null}
        initial={state.kind === "countdown" ? state.date : ""}
        today={today}
        max={max}
        onCancel={state.kind === "countdown" ? () => setEditing(false) : null}
        onSaved={() => setEditing(false)}
      />
    );

  if (variant === "inline") return <div className={className}>{body}</div>;
  return (
    <Card aria-label="Your exam date" className={cx("flex flex-col justify-center", className)}>
      {body}
    </Card>
  );
}

function ExamDateForm({
  question,
  note,
  initial,
  today,
  max,
  onCancel,
  onSaved,
}: {
  question: string;
  note: string | null;
  initial: string;
  today: string;
  max: string;
  /** Edit only: back to the countdown. Without it the form offers Skip. */
  onCancel: (() => void) | null;
  onSaved: () => void;
}) {
  const router = useRouter();
  const id = useId();
  const [date, setDate] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(body: { date: string } | { skip: true }) {
    setBusy(true);
    setError(null);
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
          onChange={(event) => setDate(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cx("h-9 min-w-0 rounded-full border border-fg-subtle bg-card px-4 text-body text-fg", styles.FOCUS_RING)}
        />
        <button type="submit" disabled={busy} className={cx(styles.PILL_QUIET, "disabled:opacity-60")}>
          Save
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} className={cx(styles.SMALL_ACTION, "min-h-9 px-1")}>
            Cancel
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={() => void send({ skip: true })} className={cx(styles.SMALL_ACTION, "min-h-9 px-1")}>
            Skip
          </button>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-2 text-label text-fg">
          {error}
        </p>
      )}
    </form>
  );
}
