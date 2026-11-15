"use client";

import { useRef, useState } from "react";
import { Card, PillAction, cx, styles } from "@/components/ds";
import { useHydrated } from "@/components/ds/useHydrated";
import { isPin } from "@/domain/teacher/exam-laptop";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
const KEY = cx("flex h-14 items-center justify-center rounded-tile bg-well text-title font-medium text-fg transition-colors hover:bg-line disabled:opacity-60", styles.FOCUS_RING);

/**
 * The PIN pad: the student's name, four dots, a 3 x 4 key pad (big enough for a finger on a laptop touch screen or a mouse)
 * and the page's one black button, "Continue". A real password field underneath takes the keyboard, so typing works too;
 * the digits are never shown. `onSubmit` returns a message to show (a wrong PIN) or null (it moved on). The PIN is kept
 * only in this component's state and is cleared after every try.
 */
export function PinPad({ name, onSubmit, onCancel, hint }: { name: string; onSubmit: (pin: string) => Promise<string | null>; onCancel: () => void; hint?: string | null }) {
  const ready = useHydrated();
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  const add = (digit: string) => setPin((p) => (p.length < 4 ? p + digit : p));
  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!isPin(pin) || busy) return;
    setBusy(true);
    const result = await onSubmit(pin);
    setPin("");
    setMessage(result);
    setBusy(false);
    field.current?.focus();
  };

  return (
    <Card aria-labelledby="pin-title" className="mx-auto w-full max-w-md" data-testid="pin-pad">
      <p className="text-caption text-fg-muted">Class PIN</p>
      <h1 id="pin-title" className="mt-1 text-heading font-medium tracking-[-0.02em] text-fg">
        {name}
      </h1>
      <p className="mt-1 text-body text-fg-muted">Type your 4-digit PIN.</p>
      <form method="post" onSubmit={(e) => void submit(e)} noValidate className="mt-5">
        <div className="flex justify-center gap-3" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={cx("size-4 rounded-full border-2 border-fg", i < pin.length ? "bg-fg" : "bg-card")} />
          ))}
        </div>
        <label htmlFor="pin-field" className="sr-only">
          PIN, 4 digits
        </label>
        <input
          id="pin-field"
          ref={field}
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          autoFocus
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          disabled={!ready || busy}
          className="mx-auto mt-4 block h-11 w-40 rounded-tile border border-fg-subtle bg-card text-center text-title tracking-[0.5em] text-fg focus-visible:outline-2 focus-visible:outline-accent"
          data-testid="pin-field"
          aria-describedby={message ? "pin-problem" : undefined}
        />
        {message && (
          <p role="alert" id="pin-problem" className="mt-3 text-center text-body text-fg" data-testid="pin-problem">
            {message}
          </p>
        )}
        {hint && <p className="mt-3 text-center text-label text-fg-muted">{hint}</p>}
        <div className="mx-auto mt-5 grid max-w-xs grid-cols-3 gap-2" role="group" aria-label="Number pad">
          {KEYS.map((k) => (
            <button key={k} type="button" className={KEY} onClick={() => add(k)} disabled={!ready || busy} aria-label={k}>
              {k}
            </button>
          ))}
          <button type="button" className={cx(KEY, "text-body")} onClick={() => setPin("")} disabled={!ready || busy}>
            Clear
          </button>
          <button type="button" className={KEY} onClick={() => add("0")} disabled={!ready || busy} aria-label="0">
            0
          </button>
          <button type="button" className={cx(KEY, "text-body")} onClick={() => setPin((p) => p.slice(0, -1))} disabled={!ready || busy}>
            Delete
          </button>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <PillAction type="submit" size="lg" disabled={!ready || busy || !isPin(pin)} testId="pin-continue">
            Continue
          </PillAction>
          <button type="button" onClick={onCancel} className={cx(styles.SMALL_ACTION, "min-h-9")}>
            Back to the list
          </button>
        </div>
      </form>
    </Card>
  );
}
