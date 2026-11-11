import Link from "next/link";
import { Card, CardHeader, Icon, PillAction, PillButton, cx, styles } from "@/components/ds";
import { MOCK_PARTS, mockProgressLabel, type MockStatus } from "@/domain/speaking/full-mock";
import { examPartLabel, type ExamPartId } from "@/domain/speaking/exam-part";
import { PART_NAMES } from "@/features/dashboard/progress";
import { MicCheck } from "@/features/speaking-practice/components/MicCheck";
import type { UploadState } from "./upload-queue";

/*
 * The full mock's own screens on the design system (docs/design-system.md, "Full mock exam"). The parts themselves are the
 * single-part screens, unchanged. One black button per screen: "Start mock" / "Continue mock" (start), none while a part
 * runs (the part's own), "Send again" (a part that did not reach the server), "Back to Practice" (finished).
 */

/** The thin line above a running part: "Part 2 of 4", with four segments. Not interactive. */
export function MockProgressLine({ part }: { part: ExamPartId }) {
  const position = MOCK_PARTS.indexOf(part);
  return (
    <div className="flex items-center gap-3" data-testid="mock-progress">
      <p className="shrink-0 text-label font-medium text-fg" aria-live="polite">
        {mockProgressLabel(part)}
      </p>
      <div className="flex min-w-0 flex-1 gap-1" aria-hidden="true">
        {MOCK_PARTS.map((p, i) => (
          <span key={p} className={cx("h-1 flex-1 rounded-full", i <= position ? "bg-accent" : "bg-well")} />
        ))}
      </div>
    </div>
  );
}

/**
 * "Before you start" (a new mock) or "Continue your mock" (some parts are already saved). The black button is the tap that
 * unlocks sound for the whole mock; with a consent `lock` it is replaced by the lock's own explanation.
 */
export function MockStartCard({
  done,
  lock,
  starting,
  error,
  ready,
  onStart,
}: {
  /** Parts already saved (continuing); empty for a new mock. */
  done: readonly ExamPartId[];
  /** Shown instead of the start button: why this caller may not record. */
  lock?: React.ReactNode;
  starting: boolean;
  error: string | null;
  /** False until the page's scripts have run: the buttons wait for it. */
  ready: boolean;
  onStart: () => void;
}) {
  const resuming = done.length > 0;
  const next = MOCK_PARTS.find((p) => !done.includes(p));
  return (
    <Card aria-labelledby="mock-start-title" className="mx-auto w-full max-w-2xl" data-testid="mock-start">
      <p className="text-caption text-fg-muted">Speaking · 4 parts</p>
      <h1 id="mock-start-title" className="mt-1 text-stat font-light tracking-[-0.03em] text-fg">
        {resuming ? "Continue your mock" : "Full mock exam"}
      </h1>
      <p className="mt-3 text-body text-fg">
        {resuming
          ? `Your finished parts are saved. The mock goes on with ${next ? examPartLabel(next) : "the last part"}.`
          : "About 15 minutes, like the real exam. Find a quiet place and use headphones with a microphone if you can."}
      </p>
      <p className="mt-2 text-body text-fg">You can&rsquo;t pause between parts, like the real exam. You see your results when it is over.</p>

      <ol className="mt-5 divide-y divide-line" data-testid="mock-parts">
        {MOCK_PARTS.map((part) => {
          const isDone = done.includes(part);
          return (
            <li key={part} className="flex min-h-11 items-center gap-3 py-2" data-state={isDone ? "done" : "todo"}>
              <span
                aria-hidden="true"
                className={cx("flex size-6 shrink-0 items-center justify-center rounded-full text-label font-semibold", isDone ? "bg-primary text-on-primary" : "bg-well text-fg")}
              >
                {isDone ? <Icon name="check" size={14} /> : MOCK_PARTS.indexOf(part) + 1}
              </span>
              <span className="min-w-0 flex-1 text-body text-fg">
                <span className="font-semibold">{examPartLabel(part)}</span> · {PART_NAMES[part]}
              </span>
              <span className="shrink-0 text-label text-fg-muted">{isDone ? "Saved" : part === next ? "Next" : ""}</span>
            </li>
          );
        })}
      </ol>

      <div className="mt-6 border-t border-line pt-5">
        {lock ?? (
          <>
            {error && (
              <p role="alert" className="mb-4 text-body text-fg" data-testid="mock-start-error">
                {error}
              </p>
            )}
            <div className="mb-5">
              <MicCheck ready={ready} />
            </div>
            <PillAction onClick={onStart} size="lg" icon="mic" disabled={!ready || starting} className="w-full sm:w-auto disabled:cursor-wait">
              {starting ? "Starting…" : resuming ? "Continue mock" : "Start mock"}
            </PillAction>
          </>
        )}
      </div>
    </Card>
  );
}

const UPLOAD_TEXT: Record<UploadState["kind"] | "none", string> = {
  sending: "Sending…",
  sent: "Sent",
  failed: "Not sent",
  none: "Waiting",
};

/**
 * After the last part, while any part has not reached the server yet: one row per part with its state. The black button
 * appears only for a part that failed and can still be sent; a part that can never be sent says why and offers the way out.
 */
export function MockSendingCard({
  parts,
  states,
  finishFailed = null,
  onRetry,
}: {
  parts: readonly ExamPartId[];
  states: Partial<Record<ExamPartId, UploadState>>;
  /** Every part was sent but the mock could not be closed (a connection problem): said here, with "Send again". */
  finishFailed?: string | null;
  onRetry: () => void;
}) {
  const failed = parts.map((p) => states[p]).filter((s): s is Extract<UploadState, { kind: "failed" }> => s?.kind === "failed");
  const canRetry = failed.some((s) => !s.final) || Boolean(finishFailed);
  const finalFailure = failed.find((s) => s.final);
  return (
    <Card aria-labelledby="mock-sending-title" className="mx-auto w-full max-w-2xl" data-testid="mock-sending">
      <p className="flex items-center gap-2 text-label font-semibold text-fg" aria-live="polite">
        <Icon name="scoring" size={16} className="text-fg-subtle" />
        {failed.length > 0 || finishFailed ? "Not everything was sent" : "Sending your answers"}
      </p>
      <h1 id="mock-sending-title" className="mt-3 text-stat font-light tracking-[-0.03em] text-fg">
        {failed.length > 0 ? "Some parts are not sent yet" : finishFailed ? "One last step" : "Almost done"}
      </h1>
      <p className="mt-3 text-body text-fg">
        {failed.length > 0
          ? (finalFailure?.message ?? "Your recordings are still here. Check your connection and send them again.")
          : (finishFailed ?? "Keep this page open until every part is sent. Each part is scored as soon as it arrives.")}
      </p>
      <ul className="mt-5 divide-y divide-line">
        {parts.map((part) => {
          const state = states[part];
          return (
            <li key={part} className="flex min-h-11 items-center gap-3 py-2" data-part={part} data-state={state?.kind ?? "none"}>
              <span className="min-w-0 flex-1 text-body text-fg">
                <span className="font-semibold">{examPartLabel(part)}</span> · {PART_NAMES[part]}
              </span>
              <span className="shrink-0 text-label font-medium text-fg">{UPLOAD_TEXT[state?.kind ?? "none"]}</span>
            </li>
          );
        })}
      </ul>
      {canRetry && (
        <div className="mt-5">
          <PillAction onClick={onRetry} size="lg" icon="retry" className="w-full sm:w-auto">
            Send again
          </PillAction>
        </div>
      )}
      {failed.length > 0 && !canRetry && (
        <div className="mt-5">
          <PillButton href="/practice" size="lg" className="w-full sm:w-auto">
            Back to Practice
          </PillButton>
        </div>
      )}
    </Card>
  );
}

export interface FinishedPartRow {
  part: ExamPartId;
  /** The part's own result page; null when the part was not done. */
  href: string | null;
  title: string | null;
}

/**
 * "Mock finished": no overall result yet (that is the next step of the plan), just each part's own result page. A mock that
 * ran out of its 24 hours says "Mock not finished"; the parts it has keep their results.
 */
export function MockFinishedCard({ status, parts, practiceHref }: { status: Exclude<MockStatus, "in_progress">; parts: readonly FinishedPartRow[]; practiceHref: string }) {
  const finished = status === "finished";
  return (
    <Card aria-labelledby="mock-finished-title" className="mx-auto w-full max-w-2xl" data-testid="mock-finished" data-status={status}>
      <p className="flex items-center gap-2 text-label font-semibold text-fg">
        <Icon name="check" size={16} className="text-fg-subtle" />
        {finished ? "All four parts sent" : "Closed after 24 hours"}
      </p>
      <h1 id="mock-finished-title" className="mt-3 text-stat font-light tracking-[-0.03em] text-fg">
        {finished ? "Mock finished" : "Mock not finished"}
      </h1>
      <p className="mt-3 text-body text-fg">
        {finished
          ? "Each part is scored on its own. Open a part to see its result."
          : "This mock took longer than 24 hours, so it is closed. The parts you finished keep their results."}
      </p>
      <ul className="mt-5 divide-y divide-line" data-testid="mock-results">
        {parts.map(({ part, href, title }) => (
          <li key={part}>
            {href ? (
              <Link href={href} className={cx("flex min-h-14 items-center gap-3 py-2.5 hover:text-fg", styles.FOCUS_RING)} data-testid="mock-result-link" data-part={part}>
                <span className="min-w-0 flex-1">
                  <span className="block text-body font-semibold text-fg">{examPartLabel(part)} · {PART_NAMES[part]}</span>
                  {title && <span className="block text-caption text-fg-muted">{title}</span>}
                </span>
                <span className="shrink-0 text-label font-medium text-fg">See result</span>
                <Icon name="chevronDown" size={16} className="-rotate-90 text-fg-subtle" />
              </Link>
            ) : (
              <div className="flex min-h-14 items-center gap-3 py-2.5" data-part={part}>
                <span className="min-w-0 flex-1 text-body font-semibold text-fg">{examPartLabel(part)} · {PART_NAMES[part]}</span>
                <span className="shrink-0 text-label text-fg-muted">Not done</span>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-5">
        <PillButton href={practiceHref} size="lg" className="w-full sm:w-auto">
          Back to Practice
        </PillButton>
      </div>
    </Card>
  );
}

export type MockCardState =
  | { kind: "start"; href: string }
  | { kind: "continue"; href: string; done: readonly ExamPartId[] }
  /** Mock mode: the demo, always playable. `soon` adds the "Coming soon" note when the real mock is not open yet. */
  | { kind: "demo"; href: string; soon: boolean }
  | { kind: "soon" };

/**
 * The "Full mock exam" card at the top of `/practice`, and its one black button: Start (real, all four parts live),
 * Continue (a mock is in progress), Try the demo (mock mode), or no button at all, just "Coming soon.", until the real mock
 * is open. The dashboard's Continue card says the same thing in its own layout.
 */
export function MockExamCard({ state }: { state: MockCardState }) {
  const next = state.kind === "continue" ? MOCK_PARTS.find((p) => !state.done.includes(p)) : undefined;
  return (
    <Card aria-labelledby="mock-card-title" data-testid="mock-card" data-state={state.kind}>
      <CardHeader id="mock-card-title" title={state.kind === "continue" ? "Continue your mock" : "Full mock exam"} className="mb-1" />
      <p className="text-body text-fg">
        {state.kind === "continue" && next
          ? `${state.done.map(examPartLabel).join(", ") || "Nothing"} saved. ${examPartLabel(next)} is next.`
          : "All 4 parts, about 15 minutes, like the real exam."}
      </p>
      {state.kind === "soon" && (
        <p className="mt-2 text-label text-fg-muted" data-testid="mock-status">
          <span className="font-medium text-fg">Coming soon.</span> The full mock opens when all four parts are open.
        </p>
      )}
      {state.kind === "demo" && state.soon && (
        <p className="mt-2 text-label text-fg-muted" data-testid="mock-status">
          <span className="font-medium text-fg">Coming soon.</span> You can try the demo; it is not scored.
        </p>
      )}
      {state.kind !== "soon" && (
        <div className="mt-4">
          <PillButton href={state.href} size="lg" icon="mic" className="w-full sm:w-auto">
            {state.kind === "continue" ? "Continue your mock" : state.kind === "demo" ? "Try the demo mock" : "Start mock exam"}
          </PillButton>
        </div>
      )}
    </Card>
  );
}

/** The dashboard card of a mock in progress: it replaces the page's other black button (Practise next goes grey). */
export function ContinueMockCard({ href, done, quiet = false, className }: { href: string; done: readonly ExamPartId[]; /** A teacher's Home keeps "Create class" as its black button. */ quiet?: boolean; className?: string }) {
  const next = MOCK_PARTS.find((p) => !done.includes(p));
  return (
    <Card aria-labelledby="continue-mock-title" className={cx("flex items-center justify-between gap-4", className)} data-testid="continue-mock">
      <div className="min-w-0">
        <p className="text-caption text-fg-muted">Full mock exam</p>
        <h2 id="continue-mock-title" className="mt-0.5 text-title font-medium tracking-[-0.01em] text-fg">
          Continue your mock
        </h2>
        <p className="mt-0.5 text-label text-fg-muted">{next ? `${done.length} of ${MOCK_PARTS.length} parts saved · ${examPartLabel(next)} is next` : "All parts saved"}</p>
      </div>
      <PillButton href={href} variant={quiet ? "quiet" : "primary"} className="shrink-0">
        Continue
      </PillButton>
    </Card>
  );
}
