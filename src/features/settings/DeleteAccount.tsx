"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useHydrated } from "@/components/ds/useHydrated";
import { DELETED_ITEMS, DELETE_CONFIRMATION, isDeleteConfirmed } from "@/domain/account";
import { FIELD, FIELD_LABEL, QUIET_BUTTON, TEXT_BUTTON, errorMessage } from "@/features/account/fields";

export const ACCOUNT_DELETED = "Your account and everything in it were deleted.";
export const DEMO_NOT_DELETED = "Demo mode. Nothing was deleted.";

/**
 * Delete my account, in two steps on the page. First a grey "Delete my account"; it opens the list of exactly what
 * will be deleted (`DELETED_ITEMS`), the account's password and a field where the student types DELETE. "Delete
 * everything" stays disabled until both are filled and the field says DELETE (and until the page is ready). Then `POST /api/account/delete`, which deletes it all,
 * recordings included, and signs this browser out. Grey, never black: a destructive action is never the page's main
 * one. `demo`: both steps are shown, nothing is sent, and the page says nothing was deleted.
 */
export function DeleteAccount({ demo = false }: { demo?: boolean }) {
  const id = useId();
  const ready = useHydrated();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (done === ACCOUNT_DELETED) {
    return (
      <div className="flex flex-col gap-2">
        <p role="status" className="text-body font-medium text-fg" data-testid="delete-done">
          {done}
        </p>
        <Link href="/" className={TEXT_BUTTON}>
          Go to CEFRO
        </Link>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-body text-fg-muted">Delete your account and everything CEFRO keeps about you.</p>
        <div>
          <button type="button" disabled={!ready} onClick={() => setOpen(true)} className={QUIET_BUTTON}>
            Delete my account
          </button>
        </div>
        {done && (
          <p role="status" className="text-label text-fg" data-testid="delete-done">
            {done}
          </p>
        )}
      </div>
    );
  }

  async function confirm() {
    setError(null);
    if (!password) return setError("Enter your password.");
    if (!isDeleteConfirmed(typed)) return setError(`Type ${DELETE_CONFIRMATION} to confirm.`);
    if (demo) {
      setOpen(false);
      setTyped("");
      setPassword("");
      return setDone(DEMO_NOT_DELETED);
    }
    setBusy(true);
    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ password, confirm: typed }),
      });
      if (!response.ok) return setError(await errorMessage(response));
      setDone(ACCOUNT_DELETED);
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
      data-testid="delete-confirm"
      onSubmit={(event) => {
        event.preventDefault();
        void confirm();
      }}
    >
      <div>
        <p className="text-body font-medium text-fg">This deletes, for good:</p>
        <ul className="mt-1.5 list-disc pl-5 text-body text-fg" data-testid="delete-list">
          {DELETED_ITEMS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="mt-1.5 text-label text-fg-muted">It can&apos;t be undone. You will be signed out on every device.</p>
      </div>
      <div>
        <label htmlFor={`${id}-password`} className={FIELD_LABEL}>
          Your password
        </label>
        <input
          id={`${id}-password`}
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          disabled={!ready}
          onChange={(event) => setPassword(event.target.value)}
          className={`${FIELD} mt-1.5`}
        />
      </div>
      <div>
        <label htmlFor={id} className={FIELD_LABEL}>
          Type {DELETE_CONFIRMATION} to confirm
        </label>
        <input
          id={id}
          name="confirm"
          type="text"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={typed}
          disabled={!ready}
          onChange={(event) => setTyped(event.target.value)}
          className={`${FIELD} mt-1.5`}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={!ready || busy || !password || !isDeleteConfirmed(typed)} className={QUIET_BUTTON}>
          {busy ? "Deleting…" : "Delete everything"}
        </button>
        <button type="button" disabled={busy} onClick={() => (setOpen(false), setTyped(""), setPassword(""), setError(null))} className={TEXT_BUTTON}>
          Cancel
        </button>
      </div>
      {error && (
        <p role="alert" className="text-label text-fg">
          {error}
        </p>
      )}
    </form>
  );
}
