"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { useHydrated } from "@/components/ds/useHydrated";
import { NAME_MAX_LENGTH, nameProblem, normaliseName } from "@/domain/account";
import { FIELD, FIELD_LABEL, QUIET_BUTTON, TEXT_BUTTON, errorMessage } from "@/features/account/fields";

/**
 * The account's name on Profile: shown with a small "Edit"; editing shows a field, the grey Save and Cancel. Saved with
 * `PUT /api/account/name` (the same rule on both sides: 1–50 characters, not an email address). A POST form, every control disabled until
 * the page is ready (`useHydrated`). `demo`: nothing is sent; the new name is kept on this page only.
 */
export function ProfileName({ name: initial, demo = false }: { name: string | null; demo?: boolean }) {
  const router = useRouter();
  const id = useId();
  const ready = useHydrated();
  const [name, setName] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(value: string) {
    setError(null);
    setSaved(false);
    const problem = nameProblem(value);
    if (problem) return setError(problem);
    if (demo) {
      setName(normaliseName(value));
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/account/name", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ name: value }),
      });
      if (!response.ok) return setError(await errorMessage(response));
      setName(((await response.json()) as { name: string }).name);
      setEditing(false);
      setSaved(true);
      router.refresh();
    } catch {
      setError("That didn't work. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-caption text-fg-muted">Name</p>
          <p className="mt-0.5 break-words text-title font-medium tracking-[-0.01em] text-fg" data-testid="profile-name">
            {name ?? "Not set"}
          </p>
          {saved && (
            <p role="status" className="mt-0.5 text-label text-fg">
              Name saved.
            </p>
          )}
        </div>
        <button type="button" disabled={!ready} onClick={() => setEditing(true)} aria-label="Edit name" className={TEXT_BUTTON}>
          Edit
        </button>
      </div>
    );
  }

  return (
    <form
      method="post"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void save(String(new FormData(event.currentTarget).get("name") ?? ""));
      }}
    >
      <label htmlFor={id} className={FIELD_LABEL}>
        Name
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          id={id}
          name="name"
          type="text"
          autoComplete="name"
          defaultValue={name ?? ""}
          maxLength={NAME_MAX_LENGTH + 20}
          disabled={!ready}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={FIELD}
        />
        <button type="submit" disabled={busy || !ready} className={QUIET_BUTTON}>
          Save
        </button>
        <button type="button" disabled={!ready} onClick={() => (setEditing(false), setError(null))} className={TEXT_BUTTON}>
          Cancel
        </button>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-2 text-label text-fg">
          {error}
        </p>
      )}
    </form>
  );
}
