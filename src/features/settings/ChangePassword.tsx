"use client";

import { useId, useState } from "react";
import { useHydrated } from "@/components/ds/useHydrated";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, newPasswordProblem } from "@/domain/account";
import { FIELD, FIELD_LABEL, QUIET_BUTTON, errorMessage } from "@/features/account/fields";

export const PASSWORD_CHANGED = "Your password was changed. Other devices were signed out.";
export const DEMO_PASSWORD_NOT_CHANGED = "Demo mode. Your password was not changed.";

/**
 * Change password: the current password, then the new one. `method="post"` and the only submit button disabled until
 * the page is ready (`useHydrated`), so the browser never sends the passwords itself in the address (see AuthForm).
 * Sent to `POST /api/account/password`. `demo`: the form checks what was typed and says nothing was changed; nothing
 * is sent.
 */
export function ChangePassword({ demo = false }: { demo?: boolean }) {
  const id = useId();
  const ready = useHydrated();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(form: HTMLFormElement) {
    setError(null);
    setDone(null);
    const data = new FormData(form);
    const currentPassword = String(data.get("currentPassword") ?? "");
    const newPassword = String(data.get("newPassword") ?? "");
    if (!currentPassword) return setError("Enter your current password.");
    const problem = newPasswordProblem(newPassword);
    if (problem) return setError(`New password: ${problem.charAt(0).toLowerCase()}${problem.slice(1)}`);
    if (demo) {
      form.reset();
      return setDone(DEMO_PASSWORD_NOT_CHANGED);
    }
    setBusy(true);
    try {
      const response = await fetch("/api/account/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!response.ok) return setError(await errorMessage(response));
      form.reset();
      setDone(PASSWORD_CHANGED);
    } catch {
      setError("That didn't work. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      method="post"
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit(event.currentTarget);
      }}
    >
      <div>
        <label htmlFor={`${id}-current`} className={FIELD_LABEL}>
          Current password
        </label>
        <input
          id={`${id}-current`}
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          maxLength={PASSWORD_MAX_LENGTH}
          className={`${FIELD} mt-1.5`}
        />
      </div>
      <div>
        <label htmlFor={`${id}-new`} className={FIELD_LABEL}>
          New password
        </label>
        <input
          id={`${id}-new`}
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={PASSWORD_MAX_LENGTH}
          aria-describedby={`${id}-hint`}
          className={`${FIELD} mt-1.5`}
        />
        <p id={`${id}-hint`} className="mt-1 text-caption text-fg-muted">
          At least {PASSWORD_MIN_LENGTH} characters.
        </p>
      </div>
      <div>
        <button type="submit" disabled={busy || !ready} className={QUIET_BUTTON}>
          {busy ? "One moment…" : "Change password"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-label text-fg">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="text-label text-fg" data-testid="password-done">
          {done}
        </p>
      )}
    </form>
  );
}
