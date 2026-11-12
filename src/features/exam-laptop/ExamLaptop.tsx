"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Card, DemoLabel, PillAction, cx, styles } from "@/components/ds";
import { useHydrated } from "@/components/ds/useHydrated";
import type { ExamPartId } from "@/domain/speaking/exam-part";
import { MAX_PIN_FAILURES, isPin, rosterStateLabel, type RosterState } from "@/domain/teacher/exam-laptop";
import { FullMockRunner } from "@/features/full-mock/FullMockRunner";
import type { MockPartPlan } from "@/features/full-mock/plan";
import { laptopId as readLaptopId } from "./laptop-id";
import { PinPad } from "./PinPad";

/*
 * T7 Exam laptop (docs/v1-plan.md sections 5 and 6): the teacher's laptop, signed in as the teacher, shows ONE thing to the
 * students: the class name, "Tap your name", and who is Not started / In progress (Room 2) / Done. A name opens the PIN pad,
 * a correct PIN gives this laptop a pass for that student only, and the full mock runs exactly as at home. At the end:
 * "Done. Your results will be on your phone." and back to the list. No result, level or band is ever shown here, and the
 * only way out to the teacher's pages is "Teacher options", which needs the teacher's password.
 */

export interface RosterEntryView {
  memberId: string;
  name: string;
  state: RosterState;
  room: string | null;
  hasPin: boolean;
  lockedHere: boolean;
  locked: boolean;
  pickable: boolean;
}

type View =
  | { kind: "list" }
  | { kind: "pin"; entry: RosterEntryView }
  | { kind: "run"; entry: RosterEntryView; passId: string; plans: MockPartPlan[]; finished: ExamPartId[] }
  | { kind: "done"; name: string };

export interface ExamLaptopProps {
  classId: string;
  classMockId: string;
  className: string;
  title: string;
  /** This laptop's name ("Room 2"). */
  room: string;
  /** Where "End exam laptop" goes (the class page), and where closing the class mock goes (T8). */
  endHref: string;
  resultsHref: string;
  /** Mock mode: the list and the plans come from here, nothing is sent, the PIN is `demoPin`. */
  demo?: { roster: RosterEntryView[]; plans: MockPartPlan[]; pin: string } | null;
  /** Mock mode, browser tests only: shorter preparation and speaking time. */
  timeScale?: number;
}

type ApiResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

async function call<T>(url: string, method: "GET" | "POST", body?: unknown): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const data = response.status === 204 ? null : await response.json().catch(() => null);
    if (response.ok) return { ok: true, data: data as T };
    const error = (data as { error?: { code?: string; message?: string } } | null)?.error;
    return { ok: false, code: error?.code ?? "http_error", message: error?.message ?? "That didn't work. Please try again." };
  } catch {
    return { ok: false, code: "network", message: "We couldn't reach CEFRO. Check the connection and try again." };
  }
}

const SECTIONS: { state: RosterState; title: string }[] = [
  { state: "not_started", title: "Not started" },
  { state: "in_progress", title: "In progress" },
  { state: "done", title: "Done" },
];

export function ExamLaptop({ classId, classMockId, className, title, room, endHref, resultsHref, demo = null, timeScale = 1 }: ExamLaptopProps) {
  const ready = useHydrated();
  const [view, setView] = useState<View>({ kind: "list" });
  const [entries, setEntries] = useState<RosterEntryView[]>(demo?.roster ?? []);
  const [loaded, setLoaded] = useState(Boolean(demo));
  const [problem, setProblem] = useState<string | null>(null);
  // This laptop's own id lives in the browser: null while the page is rendered on the server.
  const laptop = useSyncExternalStore(
    () => () => {},
    () => readLaptopId(),
    () => null,
  );
  // Demo only: wrong PINs per student, on this page.
  const [demoFailures, setDemoFailures] = useState<Record<string, number>>({});

  const base = `/api/teacher/classes/${encodeURIComponent(classId)}/exam/${encodeURIComponent(classMockId)}`;

  const reload = useCallback(async () => {
    if (demo || !laptop) return;
    const result = await call<{ students: RosterEntryView[] }>(`${base}/roster?${new URLSearchParams({ laptop })}`, "GET");
    if (result.ok) {
      setEntries(result.data.students);
      setProblem(null);
      setLoaded(true);
    } else if (result.code === "network") setProblem(result.message);
    else setProblem("This list could not be loaded. Ask your teacher.");
  }, [base, demo, laptop]);

  // The list follows the other laptop: a student in progress there can't be picked here.
  const watching = view.kind === "list" || view.kind === "done";
  useEffect(() => {
    if (!watching) return;
    const first = window.setTimeout(() => void reload(), 0);
    const timer = window.setInterval(() => void reload(), 4000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [watching, reload]);

  const shown = useMemo(
    () =>
      entries.map((e) => (demo ? { ...e, lockedHere: (demoFailures[e.memberId] ?? 0) >= MAX_PIN_FAILURES, pickable: e.hasPin && e.state === "not_started" && (demoFailures[e.memberId] ?? 0) < MAX_PIN_FAILURES } : e)),
    [entries, demo, demoFailures],
  );

  const submitPin = async (entry: RosterEntryView, pin: string): Promise<string | null> => {
    if (!isPin(pin)) return "Use exactly 4 digits.";
    if (demo) {
      if (pin !== demo.pin) {
        const count = (demoFailures[entry.memberId] ?? 0) + 1;
        setDemoFailures((f) => ({ ...f, [entry.memberId]: count }));
        if (count >= MAX_PIN_FAILURES) {
          setView({ kind: "list" });
          return null;
        }
        const left = MAX_PIN_FAILURES - count;
        return `That PIN isn't right. ${left} ${left === 1 ? "try" : "tries"} left.`;
      }
      setView({ kind: "run", entry, passId: "demo-pass", plans: demo.plans, finished: [] });
      return null;
    }
    if (!laptop) return "This laptop could not be identified. Reload the page.";
    const result = await call<{ passId: string; name: string; plans: MockPartPlan[]; finished: ExamPartId[] }>(`${base}/pin`, "POST", { memberId: entry.memberId, pin, laptopId: laptop, room });
    if (result.ok) {
      setView({ kind: "run", entry: { ...entry, name: result.data.name }, passId: result.data.passId, plans: result.data.plans, finished: result.data.finished });
      return null;
    }
    // Locked, done, or taken on the other laptop: back to the list, which now says why.
    if (["pin_locked", "already_done", "in_progress_elsewhere", "class_mock_closed", "no_pin"].includes(result.code)) {
      setView({ kind: "list" });
      setProblem(result.message);
      void reload();
      return null;
    }
    return result.message;
  };

  const finished = useCallback(
    (name: string, memberId: string) => {
      if (demo) setEntries((list) => list.map((e) => (e.memberId === memberId ? { ...e, state: "done", room: null } : e)));
      setView({ kind: "done", name });
    },
    [demo],
  );

  // After the end screen the list comes back by itself, so the next student starts from the list.
  useEffect(() => {
    if (view.kind !== "done") return;
    const timer = window.setTimeout(() => setView({ kind: "list" }), 20_000);
    return () => window.clearTimeout(timer);
  }, [view.kind]);

  const runLaptop = useMemo(
    () =>
      view.kind === "run" && (demo || laptop)
        ? { passId: view.passId, laptopId: laptop ?? "demo-laptop-000000", greeting: `Hi ${view.entry.name}, this mock is saved to your account`, onDone: () => finished(view.entry.name, view.entry.memberId) }
        : null,
    [view, laptop, demo, finished],
  );

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-4 px-4 py-6 lg:py-10" data-testid="exam-laptop" data-view={view.kind}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        {/* The wordmark is not a link: nothing on this screen leads out to the teacher's pages. */}
        <p className="text-body font-semibold tracking-[0.18em] text-fg">CEFRO</p>
        <p className="text-label text-fg-muted" data-testid="laptop-room">
          {className} · {title} · {room}
        </p>
      </header>
      {demo && <DemoLabel variant="class" className="bg-card" />}

      {view.kind === "list" && (
        <>
          <Card aria-labelledby="tap-title" data-testid="roster">
            <h1 id="tap-title" className="text-heading font-medium tracking-[-0.02em] text-fg">
              Tap your name
            </h1>
            <p className="mt-1 text-body text-fg-muted">{className}</p>
            {problem && (
              <p role="alert" className="mt-3 text-body text-fg" data-testid="roster-problem">
                {problem}
              </p>
            )}
            {!loaded ? (
              <p className="mt-5 text-body text-fg-muted" aria-live="polite">
                Loading…
              </p>
            ) : (
              SECTIONS.map(({ state, title: sectionTitle }) => {
                const group = shown.filter((e) => e.state === state);
                if (group.length === 0) return null;
                return (
                  <section key={state} className="mt-5" aria-labelledby={`roster-${state}`} data-testid={`roster-${state}`}>
                    <h2 id={`roster-${state}`} className="text-label font-semibold text-fg-muted">
                      {sectionTitle} · {group.length}
                    </h2>
                    <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {group.map((e) => (
                        <li key={e.memberId}>
                          {e.pickable ? (
                            <button
                              type="button"
                              disabled={!ready}
                              onClick={() => {
                                setProblem(null);
                                setView({ kind: "pin", entry: e });
                              }}
                              className={cx("flex min-h-14 w-full flex-col justify-center rounded-tile bg-well px-4 py-2 text-left transition-colors hover:bg-line disabled:opacity-60", styles.FOCUS_RING)}
                              data-testid="roster-name"
                              data-state={e.state}
                            >
                              <span className="text-lead font-semibold text-fg">{e.name}</span>
                              <span className="text-caption text-fg-muted">{rosterStateLabel(e.state, e.room)}</span>
                            </button>
                          ) : (
                            <div className="flex min-h-14 w-full flex-col justify-center rounded-tile border border-line px-4 py-2" data-testid="roster-name-fixed" data-state={e.state}>
                              <span className="text-lead font-semibold text-fg">{e.name}</span>
                              <span className="text-caption text-fg-muted">{fixedCaption(e)}</span>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })
            )}
            {loaded && shown.length === 0 && <p className="mt-5 text-body text-fg-muted">No students share with this class yet.</p>}
          </Card>
          <TeacherOptions classId={classId} classMockId={classMockId} laptop={laptop} demo={Boolean(demo)} entries={shown} endHref={endHref} resultsHref={resultsHref} onChanged={() => void reload()} onUnlockedDemo={(id) => setDemoFailures((f) => ({ ...f, [id]: 0 }))} />
        </>
      )}

      {view.kind === "pin" && <PinPad name={view.entry.name} onSubmit={(pin) => submitPin(view.entry, pin)} onCancel={() => setView({ kind: "list" })} hint={demo ? `Demo mode: the PIN is ${demo.pin}.` : null} />}

      {view.kind === "run" && runLaptop && <FullMockRunner mock={Boolean(demo)} plans={view.plans} finished={view.finished} lock={null} timeScale={timeScale} laptop={runLaptop} />}

      {view.kind === "done" && (
        <Card aria-labelledby="done-title" className="mx-auto w-full max-w-xl text-center" data-testid="laptop-done">
          <h1 id="done-title" className="text-heading font-medium tracking-[-0.02em] text-fg">
            Done.
          </h1>
          <p className="mt-2 text-lead text-fg">Your results will be on your phone.</p>
          <div className="mt-6">
            <PillAction size="lg" onClick={() => { setView({ kind: "list" }); void reload(); }} disabled={!ready}>
              Back to the list
            </PillAction>
          </div>
        </Card>
      )}
    </div>
  );
}

function fixedCaption(e: RosterEntryView): string {
  if (e.state === "done") return "Done";
  if (e.state === "in_progress") return rosterStateLabel("in_progress", e.room);
  if (!e.hasPin) return "No PIN yet. Set one on your phone.";
  if (e.lockedHere) return "Locked. Ask your teacher.";
  return rosterStateLabel(e.state, e.room);
}

/**
 * "Teacher options": unlock a locked student, End exam laptop, and closing the class mock. Every one asks for the teacher's
 * PASSWORD (the laptop is a shared screen, and unlocking is more PIN tries). Quiet and small: the students' screen has one
 * thing to do, tap a name.
 */
function TeacherOptions({
  classId,
  classMockId,
  laptop,
  demo,
  entries,
  endHref,
  resultsHref,
  onChanged,
  onUnlockedDemo,
}: {
  classId: string;
  classMockId: string;
  laptop: string | null;
  demo: boolean;
  entries: RosterEntryView[];
  endHref: string;
  resultsHref: string;
  onChanged: () => void;
  onUnlockedDemo: (memberId: string) => void;
}) {
  const ready = useHydrated();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/api/teacher/classes/${encodeURIComponent(classId)}/exam/${encodeURIComponent(classMockId)}`;
  const locked = entries.filter((e) => e.locked || e.lockedHere);

  const run = async (action: () => Promise<ApiResult<unknown>>, then?: () => void) => {
    if (!password) return setMessage("Enter your password.");
    setBusy(true);
    setMessage(null);
    const result = demo ? ({ ok: true, data: null } as const) : await action();
    if (result.ok) {
      setPassword("");
      if (then) then();
      else {
        setMessage("Done.");
        onChanged();
      }
    } else setMessage(result.message);
    setBusy(false);
  };

  if (!open) {
    return (
      <div className="flex justify-end">
        <button type="button" onClick={() => setOpen(true)} disabled={!ready} className={cx(styles.SMALL_ACTION, "min-h-9 px-2 disabled:opacity-60")} data-testid="teacher-options-open">
          Teacher options
        </button>
      </div>
    );
  }
  return (
    <Card aria-labelledby="teacher-options-title" data-testid="teacher-options">
      <h2 id="teacher-options-title" className="text-title font-medium tracking-[-0.01em] text-fg">
        Teacher options
      </h2>
      <p className="mt-1 text-body text-fg-muted">Enter your password to unlock a student or end the exam laptop.</p>
      <label htmlFor="teacher-password" className="mt-4 block text-caption font-semibold text-fg">
        Your password
      </label>
      <input
        id="teacher-password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={cx("mt-1 h-11 w-full max-w-sm rounded-tile border border-fg-subtle bg-card px-3 text-body text-fg", styles.FOCUS_RING)}
        data-testid="teacher-password"
      />
      {locked.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2" aria-label="Locked students">
          {locked.map((e) => (
            <li key={e.memberId} className="flex flex-wrap items-center gap-3">
              <span className="text-body text-fg">{e.name} is locked.</span>
              <PillAction
                variant="quiet"
                size="md"
                disabled={!ready || busy}
                onClick={() =>
                  void run(
                    () => call(`${base}/unlock`, "POST", { memberId: e.memberId, password }),
                    demo ? () => { onUnlockedDemo(e.memberId); setMessage(`${e.name} is unlocked.`); } : undefined,
                  )
                }
              >
                Unlock {e.name}
              </PillAction>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <PillAction variant="quiet" disabled={!ready || busy} onClick={() => void run(() => call(`${base}/end`, "POST", { password, laptopId: laptop, close: false }), () => router.push(endHref))} testId="end-laptop">
          End exam laptop
        </PillAction>
        <PillAction variant="quiet" disabled={!ready || busy} onClick={() => void run(() => call(`${base}/end`, "POST", { password, laptopId: laptop, close: true }), () => router.push(resultsHref))} testId="end-class-mock">
          End and close the class mock
        </PillAction>
        <button type="button" onClick={() => { setOpen(false); setPassword(""); setMessage(null); }} className={cx(styles.SMALL_ACTION, "min-h-9 px-2")}>
          Cancel
        </button>
      </div>
      <p className="mt-2 text-label text-fg-muted">&ldquo;End and close&rdquo; also stops the other laptop from starting new mocks. A student already under way finishes.{demo && " Demo mode: nothing is sent."}</p>
      {message && (
        <p role="alert" className="mt-2 text-label text-fg" data-testid="teacher-options-message">
          {message}
        </p>
      )}
    </Card>
  );
}
