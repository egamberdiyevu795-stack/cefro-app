"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, CardHeader, PillAction, cx, styles } from "@/components/ds";
import { useHydrated } from "@/components/ds/useHydrated";
import { DEFAULT_ROOM_LABEL, ROOM_LABEL_MAX_LENGTH, normaliseRoomLabel, type PaperMode } from "@/domain/teacher/exam-laptop";
import { examPartLabel, type ExamPartId } from "@/domain/speaking/exam-part";
import { teacherHref, teacherLinks } from "@/features/teacher/links";
import { laptopId as readLaptopId, rememberRoom } from "./laptop-id";

export interface StartExamProps {
  classId: string;
  className: string;
  /** The class mock already open (another laptop started it): this laptop joins it. */
  open: { id: string; title: string; paper: { part: ExamPartId; title: string }[] | null } | null;
  /** The "same paper" suggestion: one task per part nobody in the class has done. */
  suggestion: { part: ExamPartId; taskId: string; title: string }[];
  /** Mock mode: links keep `?mock=1&as=teacher`. (Plain data: a page can't hand a function to a client component.) */
  demo: boolean;
  /** Demo: the class mock the demo opens. */
  demoClassMockId?: string;
}

const FIELD = cx("h-11 w-full rounded-tile border border-fg-subtle bg-card px-3 text-body text-fg placeholder:text-fg-muted", styles.FOCUS_RING);

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
 * "Start exam laptop": choose "same paper for everyone" (the app suggests 4 tasks nobody in the class has done) or "a different
 * paper for each student", name this laptop, and the laptop enters exam laptop mode (T7). When another laptop already opened
 * the class's mock, there is no choice to make: this laptop joins it with its own room label. The page's one black button.
 */
export function StartExam({ classId, className, open, suggestion, demo, demoClassMockId }: StartExamProps) {
  const ready = useHydrated();
  const router = useRouter();
  const [mode, setMode] = useState<PaperMode>("same");
  const [room, setRoom] = useState(open ? "Room 2" : DEFAULT_ROOM_LABEL);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const start = async (event: React.FormEvent) => {
    event.preventDefault();
    const label = normaliseRoomLabel(room);
    if (!label) return setMessage("Give this laptop a name, like Room 2.");
    setBusy(true);
    setMessage(null);
    let classMockId: string | null = null;
    if (demo) classMockId = open?.id ?? demoClassMockId ?? "demo-class-mock";
    else {
      const result = await post(`/api/teacher/classes/${encodeURIComponent(classId)}/exam`, { mode, tasks: !open && mode === "same" ? Object.fromEntries(suggestion.map((s) => [s.part, s.taskId])) : undefined, laptopId: readLaptopId(), room: label });
      if (result.ok) classMockId = (result.data as { classMock: { id: string } }).classMock.id;
      else setMessage(result.message);
    }
    if (classMockId) {
      rememberRoom(classMockId, label);
      router.push(teacherHref(teacherLinks.examLaptop(classId, classMockId, label), { mock: demo, demoTeacher: demo }));
    }
    setBusy(false);
  };

  return (
    // The form on the left and how the exam laptop runs beside it, as on the class page, so the right half is not empty.
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.44fr)] lg:items-start">
    <Card aria-labelledby="start-exam-title" data-testid="start-exam">
      <p className="text-caption text-fg-muted">{className}</p>
      <h1 id="start-exam-title" className="mt-1 text-title font-medium tracking-[-0.01em] text-fg">
        {open ? `Join ${open.title}` : "Start exam laptop"}
      </h1>
      <p className="mt-2 text-body text-fg">
        {open
          ? "Another laptop already started this class mock. This laptop joins it: students in progress on the other laptop can't be picked here."
          : "One student at a time takes the full mock on this laptop."}
      </p>
      <form method="post" onSubmit={(e) => void start(e)} noValidate className="mt-5">
        {!open && (
          <fieldset>
            <legend className="text-caption font-semibold text-fg">Which paper?</legend>
            <div className="mt-2 flex flex-col gap-2">
              <label className={cx("flex cursor-pointer items-start gap-3 rounded-tile border p-3", mode === "same" ? "border-fg bg-well" : "border-line bg-card")}>
                <input type="radio" name="mode" value="same" checked={mode === "same"} onChange={() => setMode("same")} className="mt-1 size-4 accent-accent" disabled={!ready} />
                <span>
                  <span className="block text-body font-semibold text-fg">Same paper for everyone</span>
                  <span className="block text-label text-fg-muted">Four tasks nobody in the class has done.</span>
                </span>
              </label>
              <label className={cx("flex cursor-pointer items-start gap-3 rounded-tile border p-3", mode === "different" ? "border-fg bg-well" : "border-line bg-card")}>
                <input type="radio" name="mode" value="different" checked={mode === "different"} onChange={() => setMode("different")} className="mt-1 size-4 accent-accent" disabled={!ready} />
                <span>
                  <span className="block text-body font-semibold text-fg">A different paper for each student</span>
                  <span className="block text-label text-fg-muted">Each student gets tasks they haven&rsquo;t done recently.</span>
                </span>
              </label>
            </div>
            {mode === "same" && (
              <ol className="mt-3 divide-y divide-line rounded-tile bg-well px-3" data-testid="suggested-paper" aria-label="The suggested paper">
                {suggestion.map((s) => (
                  <li key={s.part} className="flex min-h-9 items-center gap-3 py-1.5 text-body text-fg">
                    <span className="w-14 shrink-0 text-label font-semibold">{examPartLabel(s.part)}</span>
                    <span className="min-w-0">{s.title}</span>
                  </li>
                ))}
              </ol>
            )}
          </fieldset>
        )}
        {open?.paper && (
          <ol className="mt-1 divide-y divide-line rounded-tile bg-well px-3" aria-label="The paper">
            {open.paper.map((p) => (
              <li key={p.part} className="flex min-h-9 items-center gap-3 py-1.5 text-body text-fg">
                <span className="w-14 shrink-0 text-label font-semibold">{examPartLabel(p.part)}</span>
                <span className="min-w-0">{p.title}</span>
              </li>
            ))}
          </ol>
        )}
        <label htmlFor="room-label" className="mt-5 block text-caption font-semibold text-fg">
          Name of this laptop
        </label>
        <input id="room-label" value={room} onChange={(e) => setRoom(e.target.value)} maxLength={ROOM_LABEL_MAX_LENGTH} className={cx(FIELD, "mt-1 w-48")} disabled={!ready} aria-describedby="room-note" autoComplete="off" />
        <p id="room-note" className="mt-1 text-label text-fg-muted">
          The other laptop&rsquo;s list shows it: &ldquo;In progress ({room.trim() || "Room 2"})&rdquo;.
        </p>
        {message && (
          <p role="alert" className="mt-3 text-label text-fg">
            {message}
          </p>
        )}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <PillAction type="submit" size="lg" icon="mic" disabled={!ready || busy}>
            {open ? "Join and start exam laptop" : "Start exam laptop"}
          </PillAction>
          <Link href={teacherHref(teacherLinks.cls(classId), { mock: demo, demoTeacher: demo })} className={cx(styles.SMALL_ACTION, "min-h-9")}>
            Cancel
          </Link>
        </div>
      </form>
    </Card>
    <Card aria-labelledby="how-title">
      <CardHeader id="how-title" title="How it runs" />
      <ol className="flex list-decimal flex-col gap-2 pl-4 text-body text-fg-muted marker:text-fg-subtle">
        <li>This laptop signs out of your account and shows the class list.</li>
        <li>Each student taps their name and types their class PIN, so their mock is saved to their own account.</li>
        <li>They take all four parts; the next student starts when they finish.</li>
        <li>To end the exam you type your email and password on this laptop.</li>
      </ol>
    </Card>
    </div>
  );
}
