"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PillAction, cx, styles } from "@/components/ds";
import { useHydrated } from "@/components/ds/useHydrated";
import type { BandLabel } from "@/features/result/view-model";
import { teacherHref, teacherLinks } from "./links";
import { bandOptionLabel, ratingText, type TeacherRating } from "./view-model";

/*
 * The Teacher view's controls. `demo` (mock mode): every action changes the page only; nothing is sent. Otherwise the
 * action calls the API, then refreshes or moves on. Every control is disabled until the page is ready (useHydrated).
 */

async function send(url: string, method: string, body?: unknown): Promise<{ ok: true; data: unknown } | { ok: false; message: string }> {
  try {
    const response = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = response.status === 204 ? null : await response.json().catch(() => null);
    if (response.ok) return { ok: true, data };
    return { ok: false, message: (data as { error?: { message?: string } } | null)?.error?.message ?? "That didn't work. Please try again." };
  } catch {
    return { ok: false, message: "We couldn't reach CEFRO. Check your connection and try again." };
  }
}

const FIELD = cx("h-11 w-full rounded-tile border border-fg-subtle bg-card px-3 text-body text-fg placeholder:text-fg-muted", styles.FOCUS_RING);

function Problem({ text, id }: { text: string | null; id?: string }) {
  return text ? (
    <p role="alert" id={id} className="mt-2 text-label text-fg">
      {text}
    </p>
  ) : null;
}

/* ------------------------------------------------------------------------------------------------ join code (T3) */

/**
 * The class's join code, large, with the black "Copy join code" and a quiet "Reset code" (the old code stops at
 * once; members stay). Demo: Reset makes a new code on the page only.
 */
export function JoinCodeCard({ code: initial, classId, demo, primary = true }: { code: string; classId: string; demo: boolean; primary?: boolean }) {
  const ready = useHydrated();
  const [code, setCode] = useState(initial);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setStatus("Copied.");
    } catch {
      setStatus("Copy it by hand: select the code above.");
    }
  };
  const reset = async () => {
    setBusy(true);
    if (demo) {
      setCode(demoCode(code));
      setStatus("New code. The old one no longer works. Demo mode: nothing was saved.");
    } else {
      const result = await send(`/api/teacher/classes/${encodeURIComponent(classId)}/code`, "POST");
      if (result.ok) {
        setCode((result.data as { joinCode: string }).joinCode);
        setStatus("New code. The old one no longer works.");
      } else setStatus(result.message);
    }
    setBusy(false);
  };

  return (
    <div>
      <p className="text-caption text-fg-muted">Join code</p>
      <p className="mt-1 text-stat font-light tracking-[0.12em] text-fg" data-testid="join-code" aria-label={`Join code ${code.split("").join(" ")}`}>
        {code}
      </p>
      <p className="mt-2 text-body text-fg-muted">Students enter this on their Account page.</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <PillAction onClick={() => void copy()} variant={primary ? "primary" : "quiet"} icon="layers" disabled={!ready}>
          Copy join code
        </PillAction>
        <button type="button" onClick={() => void reset()} disabled={!ready || busy} className={cx(styles.SMALL_ACTION, "min-h-9 px-2 disabled:opacity-60")}>
          Reset code
        </button>
      </div>
      <p role="status" className="mt-2 min-h-4 text-label text-fg">
        {status}
      </p>
    </div>
  );
}

/** A different made-up code for the demo's Reset (never a real one: demo codes keep an "O"). */
function demoCode(current: string): string {
  const pool = ["DEMO57", "DEMO83", "DEMO26", "DEMO42"];
  return pool[(pool.indexOf(current) + 1) % pool.length];
}

/* ------------------------------------------------------------------------------------- confirm card (quiet action) */

/**
 * A quiet action that opens a confirm card (Close class, Remove from class, Leave class). Both buttons in the card are
 * grey: a destructive action is never black. Demo: confirming changes the page only (`demoDone`).
 */
export function ConfirmAction({
  label,
  title,
  text,
  confirmLabel,
  request,
  then,
  demo,
  demoDone,
  testId,
}: {
  label: string;
  title: string;
  text: React.ReactNode;
  confirmLabel: string;
  /** The API call (real mode). */
  request: { url: string; method: "POST" | "DELETE" };
  /** Where to go afterwards (real mode); null: refresh this page. */
  then: string | null;
  demo: boolean;
  /** What the page says after a demo confirm. */
  demoDone: string;
  testId?: string;
}) {
  const ready = useHydrated();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const confirm = async () => {
    setBusy(true);
    if (demo) {
      setDone(true);
      setOpen(false);
    } else {
      const result = await send(request.url, request.method);
      if (result.ok) {
        if (then) router.push(then);
        else router.refresh();
        setOpen(false);
      } else setMessage(result.message);
    }
    setBusy(false);
  };

  if (done) {
    return (
      <p role="status" className="rounded-tile bg-well p-3 text-body text-fg" data-testid={testId && `${testId}-done`}>
        {demoDone}
      </p>
    );
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} disabled={!ready} className={cx(styles.SMALL_ACTION, "min-h-9 disabled:opacity-60")} data-testid={testId}>
        {label}
      </button>
    );
  }
  return (
    <div role="group" aria-labelledby={`${testId ?? "confirm"}-title`} className="rounded-tile border border-line bg-card p-4">
      <p id={`${testId ?? "confirm"}-title`} className="text-body font-semibold text-fg">
        {title}
      </p>
      <div className="mt-1 text-body text-fg-muted">{text}</div>
      <div className="mt-4 flex flex-wrap gap-2">
        <PillAction onClick={() => void confirm()} variant="quiet" disabled={busy} autoFocus>
          {confirmLabel}
        </PillAction>
        <PillAction onClick={() => setOpen(false)} variant="quiet" disabled={busy}>
          Cancel
        </PillAction>
      </div>
      <Problem text={message} />
    </div>
  );
}

/* ----------------------------------------------------------------------------------------------- your view (T5) */

/**
 * "Your view" on a shared attempt: the app's verdict, then Agree and Choose level, both grey, the same size, side by
 * side, so nothing pushes agreement. Choose level lists the part's bands with our labels. After: "You: Agree" or
 * "You: Higher B2 (Band 4)" with a quiet Change. Demo: the page only.
 */
export function YourView({
  verdict,
  bands,
  initial,
  url,
  demo,
}: {
  verdict: string;
  bands: readonly BandLabel[];
  initial: TeacherRating | null;
  url: string;
  demo: boolean;
}) {
  const ready = useHydrated();
  const [rating, setRating] = useState<TeacherRating | null>(initial);
  const [choosing, setChoosing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (next: TeacherRating) => {
    setBusy(true);
    setMessage(null);
    if (demo) {
      setRating(next);
      setChoosing(false);
    } else {
      const result = await send(url, "PUT", next);
      if (result.ok) {
        setRating((result.data as { rating: TeacherRating }).rating);
        setChoosing(false);
      } else setMessage(result.message);
    }
    setBusy(false);
  };

  return (
    <section aria-labelledby="your-view-title" className="rounded-card bg-card p-5 shadow-card sm:p-6" data-testid="your-view">
      <h2 id="your-view-title" className="text-title font-medium tracking-[-0.01em] text-fg">
        Your view
      </h2>
      <p className="mt-2 text-body text-fg" data-testid="app-verdict">
        {verdict}
      </p>
      {rating && !choosing ? (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <p className="text-body font-semibold text-fg" data-testid="your-rating">
            {ratingText(rating, bands)}
          </p>
          <button type="button" onClick={() => setChoosing(true)} disabled={!ready} className={cx(styles.SMALL_ACTION, "min-h-9 px-2 disabled:opacity-60")}>
            Change
          </button>
        </div>
      ) : choosing ? (
        <fieldset className="mt-4">
          <legend className="text-caption font-semibold text-fg">Choose level</legend>
          <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[...bands].reverse().map((band) => (
              <li key={band.band}>
                <PillAction onClick={() => void save({ agrees: false, band: band.band })} variant="quiet" disabled={!ready || busy} className="w-full">
                  {bandOptionLabel(band)}
                </PillAction>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setChoosing(false)} disabled={!ready} className={cx(styles.SMALL_ACTION, "mt-2 min-h-9 px-2")}>
            Cancel
          </button>
        </fieldset>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2" data-testid="your-view-actions">
          <PillAction onClick={() => void save({ agrees: true })} variant="quiet" disabled={!ready || busy} className="w-full">
            Agree
          </PillAction>
          <PillAction onClick={() => setChoosing(true)} variant="quiet" disabled={!ready || busy} className="w-full">
            Choose level
          </PillAction>
        </div>
      )}
      {demo && rating && <p className="mt-2 text-label text-fg-muted">Demo mode. Nothing was saved.</p>}
      <Problem text={message} />
    </section>
  );
}

/* ---------------------------------------------------------------------------------------------- create class (T2) */

/** T2: the class name, the black "Create class"; then the code, large, and the black "Copy code". */
export function CreateClassForm({ demo }: { demo: boolean }) {
  const classHref = (id: string) => teacherHref(teacherLinks.cls(id), { mock: demo, demoTeacher: true });
  const ready = useHydrated();
  const [name, setName] = useState("");
  const [created, setCreated] = useState<{ id: string; name: string; joinCode: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setMessage("Enter a name for the class.");
    setBusy(true);
    setMessage(null);
    if (demo) setCreated({ id: "demo-class", name: name.trim(), joinCode: "DEMO42" });
    else {
      const result = await send("/api/teacher/classes", "POST", { name });
      if (result.ok) setCreated((result.data as { class: { id: string; name: string; joinCode: string } }).class);
      else setMessage(result.message);
    }
    setBusy(false);
  };

  if (created) {
    return (
      <div data-testid="class-created">
        <p className="text-caption text-fg-muted">{created.name}</p>
        <p className="mt-1 text-stat font-light tracking-[0.12em] text-fg" data-testid="join-code">
          {created.joinCode}
        </p>
        <p className="mt-2 text-body text-fg">Students enter this on their Account page.</p>
        {demo && <p className="mt-1 text-label text-fg-muted">Demo mode. Nothing was saved: this is the demo class&rsquo;s code.</p>}
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <PillAction
            onClick={() =>
              void navigator.clipboard.writeText(created.joinCode).then(
                () => setCopied("Copied."),
                () => setCopied("Copy it by hand: select the code above."),
              )
            }
            icon="layers"
          >
            Copy code
          </PillAction>
          <Link href={classHref(created.id)} className={cx(styles.SMALL_ACTION, "min-h-9 px-2")}>
            Open class
          </Link>
        </div>
        <p role="status" className="mt-2 min-h-4 text-label text-fg">
          {copied}
        </p>
      </div>
    );
  }
  return (
    <form method="post" onSubmit={(e) => void submit(e)} noValidate>
      <label htmlFor="class-name" className="text-caption font-semibold text-fg">
        Class name
      </label>
      <input
        id="class-name"
        name="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={40}
        autoComplete="off"
        placeholder="e.g. Group B"
        className={cx(FIELD, "mt-1")}
        disabled={!ready}
        aria-describedby={message ? "class-name-problem" : undefined}
      />
      <Problem text={message} id="class-name-problem" />
      <button
        type="submit"
        disabled={!ready || busy}
        className={cx("mt-5 inline-flex h-11 items-center justify-center rounded-full bg-primary text-on-primary px-6 text-body font-medium hover:bg-primary/85 disabled:opacity-60", styles.FOCUS_RING)}
      >
        Create class
      </button>
    </form>
  );
}
