"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useReducer, useState, useSyncExternalStore } from "react";
import { DemoLabel } from "@/components/ds";
import { useHydrated } from "@/components/ds/useHydrated";
import type { RecordingLock } from "@/domain/consent";
import type { ExamPartId } from "@/domain/speaking/exam-part";
import { Part3Practice } from "@/features/part3/Part3Practice";
import { DEMO_MOCK_HREF } from "@/features/mock-result/links";
import { Part1Experience } from "@/features/speaking-practice/components/Part1Experience";
import { PracticeExperience } from "@/features/speaking-practice/components/PracticeExperience";
import { InlineNotice, RecordingLockedState } from "@/features/speaking-practice/components/screens";
import { setAnalyticsSession } from "@/features/speaking-practice/lib/analytics";
import { ApiError, finishMockExam, setExamPass, startMockExam } from "@/features/speaking-practice/lib/api-client";
import { primeChime } from "@/features/speaking-practice/lib/chime";
import type { EmbeddedPart, EmbeddedRecording } from "@/features/speaking-practice/lib/mock-embed";
import type { MockPartPlan } from "./plan";
import { currentPart, initialRunState, runReducer } from "./runner-machine";
import { MockProgressLine, MockSendingCard, MockStartCard } from "./screens";
import { createUnlockedAudio } from "./unlock-audio";
import { MockUploads, type UploadJob } from "./upload-queue";

function newClientAttemptId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The full mock exam (docs/v1-plan.md, section 3.2): Parts 1.1, 1.2, 2 and 3 back to back, each exactly as its own practice
 * page plays it (spoken introduction, chimes, preparation and speaking times), with no result in between and a thin
 * "Part 2 of 4" line above. Real mode: the Start tap creates (or resumes) the mock's session; each part is sent the moment
 * it ends, in the background, while the next introduction plays (upload-queue.ts); after the last part the page waits until
 * every part has arrived, closes the mock and opens its mock result page. Mock mode (`?mock=1`): nothing is sent or
 * stored, no account is needed, and the end opens the demo mock result (demo answers).
 */
export function FullMockRunner({
  plans,
  finished,
  lock,
  mock,
  timeScale = 1,
  laptop,
}: {
  /** The four planned parts (a continued mock plays only the ones that are not saved yet). */
  plans: readonly MockPartPlan[];
  /** Parts already saved on the server (continuing after a break). */
  finished: readonly ExamPartId[];
  lock: RecordingLock | null;
  mock: boolean;
  /** Mock mode, browser tests only: shortens preparation and speaking time (Parts 1 and 3). */
  timeScale?: number;
  /**
   * Exam laptop (T7): the student sits the mock on the teacher's laptop. `passId` is sent with every request
   * (the server then acts as the student), `greeting` heads "Before you start", and at the end the runner calls `onDone`
   * instead of opening the result: nothing of the result is ever shown on the shared screen.
   */
  laptop?: { passId: string; greeting: string; onDone: () => void };
}) {
  const router = useRouter();
  const ready = useHydrated();
  const [state, dispatch] = useReducer(runReducer, finished, initialRunState);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [finishTry, setFinishTry] = useState(0);

  const [uploads] = useState(() => new MockUploads());
  const uploadStates = useSyncExternalStore(
    useCallback((listener) => uploads.subscribe(listener), [uploads]),
    () => uploads.snapshot(),
    () => uploads.snapshot(),
  );

  const part = currentPart(state);
  const plan = part ? plans.find((p) => p.part === part) : undefined;

  const start = () => {
    if (lock || !ready || state.phase !== "ready") return;
    // Inside the tap: unlock sound for the whole mock (one audio element, the chime's audio context).
    setAudio(createUnlockedAudio());
    primeChime();
    dispatch({ type: "begin" });
    setExamPass(!mock && laptop ? { passId: laptop.passId } : null);
    if (mock) {
      dispatch({ type: "started", finished: [] });
      return;
    }
    startMockExam()
      .then(({ mock: session }) => {
        setSessionId(session.id);
        if (!laptop) setAnalyticsSession(session.id);
        dispatch({ type: "started", finished: session.parts.filter((p) => p.attemptId).map((p) => p.part) });
      })
      .catch((error) => dispatch({ type: "startFailed", message: error instanceof ApiError ? error.userMessage : "The mock could not be started. Please try again." }));
  };

  // A part ended: hand its recording on and play the next part at once.
  const onRecorded = useCallback(
    (ended: ExamPartId, recording: EmbeddedRecording) => {
      const planned = plans.find((p) => p.part === ended);
      if (!planned) return;
      if (mock) {
        // Mock mode: nothing is sent. The demo mock result at the end uses its own demo answers.
      } else if (sessionId) {
        const job: UploadJob = {
          part: ended,
          taskId: planned.task.id,
          sessionId,
          clientAttemptId: newClientAttemptId(),
          recording,
        };
        uploads.enqueue(job);
      }
      dispatch({ type: "partRecorded", part: ended });
    },
    [plans, mock, uploads, sessionId],
  );
  const embedded = useMemo<EmbeddedPart | null>(
    () => (audio && part ? { audio, mock, timeScale, onRecorded: (recording) => onRecorded(part, recording) } : null),
    [audio, part, mock, timeScale, onRecorded],
  );

  // After the last part: wait until every part reached the server, close the mock, open its page.
  const everySent = state.phase === "sending" && state.queue.every((p) => uploadStates[p]?.kind === "sent");
  useEffect(() => {
    if (state.phase !== "sending") return;
    if (mock) {
      dispatch({ type: "allSent" });
      if (laptop) laptop.onDone();
      else router.push(DEMO_MOCK_HREF);
      return;
    }
    const mockId = sessionId;
    if (!everySent || !mockId) return;
    let cancelled = false;
    finishMockExam(mockId)
      .then(() => {
        if (cancelled) return;
        setFinishError(null);
        dispatch({ type: "allSent" });
        if (laptop) laptop.onDone();
        else router.push(`/practice/mock/${encodeURIComponent(mockId)}`);
      })
      .catch((error) => !cancelled && setFinishError(error instanceof ApiError ? error.userMessage : "The mock could not be closed. Please try again."));
    return () => {
      cancelled = true;
    };
  }, [state.phase, everySent, mock, router, finishTry, sessionId, laptop]);

  // The pass belongs to this one mock: it is dropped when the runner goes away (the end screen, a reload, leaving).
  useEffect(() => () => setExamPass(null), []);

  // A part that failed because the device went offline is sent again as soon as it is back online.
  useEffect(() => {
    const resend = () => uploads.retryFailed();
    window.addEventListener("online", resend);
    return () => window.removeEventListener("online", resend);
  }, [uploads]);

  // Leaving while a part is being recorded, or before every part reached the server, would lose answers.
  const unsent = !mock && (state.phase === "playing" || (state.phase === "sending" && !everySent));
  useEffect(() => {
    if (!unsent) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsent]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [state.phase, part]);

  let content: React.ReactNode;
  if (state.phase === "ready" || state.phase === "starting") {
    content = (
      <MockStartCard
        done={finished}
        lock={lock ? <RecordingLockedState lock={lock} mock={mock} signInNext="/practice/mock" /> : undefined}
        starting={state.phase === "starting"}
        error={state.error}
        ready={ready}
        onStart={start}
        greeting={laptop?.greeting}
      />
    );
  } else if (state.phase === "playing" && plan && embedded && part) {
    content = (
      <div className="space-y-4">
        <MockProgressLine part={part} />
        <PartPlayer key={part} plan={plan} embedded={embedded} />
      </div>
    );
  } else if (state.phase === "playing") {
    content = <InlineNotice title="This part isn't available.">Please go back to Practice and try again.</InlineNotice>;
  } else if (state.phase === "done" && mock) {
    content = <InlineNotice title="Mock finished">Opening the demo mock result…</InlineNotice>;
  } else {
    content = (
      <MockSendingCard
        parts={state.queue}
        states={uploadStates}
        finishFailed={finishError}
        onRetry={() => (finishError && everySent ? setFinishTry((n) => n + 1) : uploads.retryFailed())}
      />
    );
  }

  return (
    <div className="space-y-4">
      {mock && !laptop && <DemoLabel variant="mode" className="bg-card" />}
      {content}
    </div>
  );
}

function PartPlayer({ plan, embedded }: { plan: MockPartPlan; embedded: EmbeddedPart }) {
  switch (plan.kind) {
    case "sequence":
      return <Part1Experience task={plan.task} sequence={plan.sequence} embedded={embedded} />;
    case "speaking":
      return <PracticeExperience task={plan.task} embedded={embedded} />;
    case "argument":
      return <Part3Practice task={plan.task} intro={plan.intro} retryOf={null} goal={null} initialChosen={[]} embedded={embedded} />;
  }
}
