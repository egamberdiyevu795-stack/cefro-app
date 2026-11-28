"use client";

import { useState } from "react";
import { Notice, PillAction, cx, styles } from "@/components/ds";
import { useHydrated } from "@/components/ds/useHydrated";
import { TEACHER_TERMS_TEXT } from "@/domain/teacher/rules";

/**
 * Take the teacher role, or give it back, from the Account page. Nobody approves it: the role on its own opens no
 * student's work, since a teacher sees an answer only after that student joins their class with its code and shares
 * it. Giving it back closes the person's open classes, so it asks first and says so.
 *
 * Mock mode: nothing is sent; the card says what would have happened.
 */
export function RoleSwitch({ role, mock }: { role: "student" | "teacher"; mock: boolean }) {
  const [terms, setTerms] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoDone, setDemoDone] = useState<string | null>(null);
  const ready = useHydrated();
  const toTeacher = role === "student";

  async function save() {
    setError(null);
    if (toTeacher && !terms) {
      setError("Tick the box above to agree first.");
      return;
    }
    if (mock) {
      setDemoDone(toTeacher ? "Demo mode: this account would now be a teacher account. Nothing was changed." : "Demo mode: teaching would now be off and the classes closed. Nothing was changed.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/account/role", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(toTeacher ? { role: "teacher", acceptedTerms: true } : { role: "student" }),
      });
      if (!response.ok) {
        setError("That didn't work. Please try again.");
        return;
      }
      window.location.reload(); // the page's own cards change with the role
    } catch {
      setError("We couldn't reach CEFRO. Check your internet connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (demoDone) return <Notice>{demoDone}</Notice>;

  if (!toTeacher) {
    return (
      <div className="space-y-3">
        {confirming ? (
          <>
            <p className="text-body text-fg">Your classes close and your students stop sharing their work with you. Their own practice is untouched.</p>
            <div className="flex flex-wrap gap-2">
              {/* Account holds no black button: the confirm is red, the way out grey. */}
              <PillAction type="button" variant="danger" onClick={() => void save()} disabled={busy || !ready} testId="stop-teaching-confirm">
                {busy ? "One moment…" : "Stop teaching"}
              </PillAction>
              <PillAction type="button" variant="quiet" onClick={() => setConfirming(false)} disabled={busy}>
                Keep teaching
              </PillAction>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className={cx("min-h-9 text-body text-fg-muted underline underline-offset-4 hover:text-fg", styles.FOCUS_RING)}
            data-testid="stop-teaching"
          >
            Stop teaching
          </button>
        )}
        {error && <Notice tone="alert">{error}</Notice>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-body text-fg-muted">
        Create a class, give your students its code, and follow the speaking of those who share it with you. You keep your own practice.
      </p>
      <label className="flex cursor-pointer items-start gap-3 text-body text-fg-muted">
        <input
          type="checkbox"
          checked={terms}
          onChange={(event) => setTerms(event.currentTarget.checked)}
          disabled={!ready}
          className="mt-0.5 size-4 shrink-0 accent-accent"
        />
        <span>{TEACHER_TERMS_TEXT}</span>
      </label>
      <PillAction type="button" variant="quiet" onClick={() => void save()} disabled={busy || !ready} testId="become-teacher">
        {busy ? "One moment…" : "Teach with CEFRO"}
      </PillAction>
      {error && <Notice tone="alert">{error}</Notice>}
    </div>
  );
}
