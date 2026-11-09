"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cx, styles } from "@/components/ds";
import { useHydrated } from "@/components/ds/useHydrated";
import { JOIN_CODE_LENGTH, SHARE_TEXT, UNKNOWN_CODE_MESSAGE, normaliseJoinCode, shownNameProblem } from "@/domain/teacher/rules";

type Invite = { className: string; teacherName: string };

const FIELD = cx("h-11 w-full rounded-tile border border-fg-subtle bg-card px-3 text-body text-fg placeholder:text-fg-muted", styles.FOCUS_RING);
const PRIMARY_SUBMIT = cx(
  "inline-flex h-11 items-center justify-center rounded-full bg-primary text-on-primary px-6 text-body font-medium hover:bg-primary/85 disabled:opacity-60",
  styles.FOCUS_RING,
);

async function post(url: string, body: unknown): Promise<{ ok: true; data: unknown } | { ok: false; message: string }> {
  try {
    const response = await fetch(url, { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => null);
    if (response.ok) return { ok: true, data };
    return { ok: false, message: (data as { error?: { message?: string } } | null)?.error?.message ?? "That didn't work. Please try again." };
  } catch {
    return { ok: false, message: "We couldn't reach CEFRO. Check your connection and try again." };
  }
}

/**
 * Join a class (S1) then Share (S2), on one page. S1: the code (6 characters, not case-sensitive), the black
 * "Continue". S2: who the code belongs to, "Name your teacher sees" (prefilled, editable, this class only), what the
 * teacher will and won't see, what happens on leaving, the black "Share with this teacher" and a quiet "Not now".
 * Nothing is stored before that tap.
 *
 * `demo` (mock mode): only the demo code works (`demoInvite`); Share changes the page only.
 */
export function JoinClass({
  suggestedName,
  accountHref,
  demo,
  demoInvite,
  demoJoinedHref,
  initialInvite = null,
  initialCode = "",
}: {
  suggestedName: string;
  accountHref: string;
  demo: boolean;
  /** Demo: the code that works and the class it opens. */
  demoInvite?: { code: string; invite: Invite } | null;
  /** Demo: the Account page as it looks after joining. */
  demoJoinedHref?: string;
  /** Demo previews only: open straight on S2. */
  initialInvite?: Invite | null;
  initialCode?: string;
}) {
  const ready = useHydrated();
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [invite, setInvite] = useState<Invite | null>(initialInvite);
  const [name, setName] = useState(suggestedName);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shared, setShared] = useState(false);

  const lookUp = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    const normalised = normaliseJoinCode(code);
    if (normalised.length !== JOIN_CODE_LENGTH) return setMessage(`Enter the ${JOIN_CODE_LENGTH}-character code from your teacher.`);
    setBusy(true);
    if (demo) {
      if (demoInvite && normalised === demoInvite.code) setInvite(demoInvite.invite);
      else setMessage(UNKNOWN_CODE_MESSAGE);
    } else {
      const result = await post("/api/classes/lookup", { code: normalised });
      if (result.ok) setInvite(result.data as Invite);
      else setMessage(result.message);
    }
    setBusy(false);
  };

  const share = async (event: React.FormEvent) => {
    event.preventDefault();
    const problem = shownNameProblem(name);
    if (problem) return setMessage(problem);
    setBusy(true);
    setMessage(null);
    if (demo) setShared(true);
    else {
      const result = await post("/api/classes", { code: normaliseJoinCode(code), shownName: name });
      if (result.ok) {
        router.push(accountHref);
        router.refresh();
      } else setMessage(result.message);
    }
    setBusy(false);
  };

  if (shared && invite) {
    return (
      <section aria-labelledby="shared-title" className="rounded-card bg-card p-5 shadow-card sm:p-6" data-testid="shared">
        <h1 id="shared-title" className="text-title font-medium tracking-[-0.01em] text-fg">
          You&rsquo;re sharing with {invite.teacherName}
        </h1>
        <p className="mt-2 text-body text-fg">
          {invite.className} · {name.trim()}. Your Part 2 attempts from now on are shared. Demo mode: nothing was saved.
        </p>
        <Link href={demoJoinedHref ?? accountHref} className={cx(styles.SMALL_ACTION, "mt-4 min-h-9")}>
          Back to your account
        </Link>
      </section>
    );
  }

  if (!invite) {
    return (
      <section aria-labelledby="join-title" className="rounded-card bg-card p-5 shadow-card sm:p-6" data-testid="join-step">
        <h1 id="join-title" className="text-title font-medium tracking-[-0.01em] text-fg">
          Join a class
        </h1>
        <p className="mt-2 text-body text-fg-muted">Enter the code your teacher gave you. Nothing is shared until you confirm on the next screen.</p>
        <form method="post" onSubmit={(e) => void lookUp(e)} noValidate className="mt-5">
          <label htmlFor="join-code" className="text-caption font-semibold text-fg">
            Class code
          </label>
          <input
            id="join-code"
            name="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={12}
            placeholder="e.g. K7M4QD"
            className={cx(FIELD, "mt-1 uppercase tracking-[0.12em]")}
            disabled={!ready}
            aria-describedby={message ? "join-problem" : undefined}
          />
          {message && (
            <p role="alert" id="join-problem" className="mt-2 text-label text-fg">
              {message}
            </p>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={!ready || busy} className={PRIMARY_SUBMIT}>
              Continue
            </button>
            <Link href={accountHref} className={cx(styles.SMALL_ACTION, "min-h-9")}>
              Cancel
            </Link>
          </div>
        </form>
      </section>
    );
  }

  return (
    <section aria-labelledby="share-title" className="rounded-card bg-card p-5 shadow-card sm:p-6" data-testid="share-step">
      <p className="text-caption text-fg-muted">Share with a teacher</p>
      <h1 id="share-title" className="mt-1 text-title font-medium tracking-[-0.01em] text-fg">
        {invite.teacherName} · {invite.className}
      </h1>
      <form method="post" onSubmit={(e) => void share(e)} noValidate className="mt-5">
        <label htmlFor="shown-name" className="text-caption font-semibold text-fg">
          Name your teacher sees
        </label>
        <input
          id="shown-name"
          name="shownName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="given-name"
          maxLength={30}
          className={cx(FIELD, "mt-1")}
          disabled={!ready}
          aria-describedby="shown-name-note"
        />
        <p id="shown-name-note" className="mt-1 text-label text-fg-muted">
          For this class only.
        </p>
        <dl className="mt-5 flex flex-col gap-3 border-t border-line pt-4 text-body">
          <div>
            <dt className="text-caption font-semibold text-fg">Will see</dt>
            <dd className="mt-0.5 text-fg">{SHARE_TEXT.willSee}</dd>
          </div>
          <div>
            <dt className="text-caption font-semibold text-fg">Won&rsquo;t see</dt>
            <dd className="mt-0.5 text-fg">{SHARE_TEXT.wontSee}</dd>
          </div>
          <div>
            <dt className="text-caption font-semibold text-fg">If you leave</dt>
            <dd className="mt-0.5 text-fg">{SHARE_TEXT.leaveAccess}</dd>
            <dd className="mt-1 text-fg-muted">{SHARE_TEXT.leavePairs}</dd>
          </div>
        </dl>
        {message && (
          <p role="alert" className="mt-3 text-label text-fg">
            {message}
          </p>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={!ready || busy} className={PRIMARY_SUBMIT}>
            Share with this teacher
          </button>
          <Link href={accountHref} className={cx(styles.SMALL_ACTION, "min-h-9")}>
            Not now
          </Link>
        </div>
      </form>
    </section>
  );
}
