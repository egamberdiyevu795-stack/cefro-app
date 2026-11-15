"use client";

import { useId, useState } from "react";
import { Card, Icon, PillAction, cx } from "@/components/ds";
import { useHydrated } from "@/components/ds/useHydrated";
import { ApiError, saveFeedbackHelpful } from "@/features/speaking-practice/lib/api-client";

/** Where the answer goes: the student's own stored attempt, or nowhere (demo results: the page only says thanks). */
export type FeedbackHelpfulTarget = { attemptId: string; initial: boolean | null } | { demo: true };

export const HELPFUL_QUESTION = "Was this feedback helpful?";
export const HELPFUL_THANKS = "Thanks for telling us.";
const THANKS_NOTE = "Your answer helps us make the feedback better.";
const ANSWERED: Record<"yes" | "no", string> = {
  yes: "You found this feedback helpful.",
  no: "You told us this feedback wasn't helpful.",
};

type State =
  | { kind: "ask"; error: string | null; saving: boolean | null }
  /** `justNow`: answered on this visit (the thank-you), else an answer stored earlier (a reload, a later visit). */
  | { kind: "answered"; helpful: boolean; justNow: boolean };

/**
 * "Was this feedback helpful?" under the Biggest fix: one tap, Yes or No, then a short thank-you in its place. One
 * answer per attempt (the server keeps the first). Both answers are quiet grey pills: the page's one black button
 * stays "Retry with this goal". The buttons are disabled until the page's scripts run (`useHydrated`), and while the
 * answer is being saved. Demo results never send anything.
 */
export function FeedbackHelpful({ target, className }: { target: FeedbackHelpfulTarget; className?: string }) {
  const hydrated = useHydrated();
  const titleId = useId();
  const stored = "attemptId" in target ? target.initial : null;
  const [state, setState] = useState<State>(
    stored === null ? { kind: "ask", error: null, saving: null } : { kind: "answered", helpful: stored, justNow: false },
  );

  const answer = async (helpful: boolean) => {
    if (state.kind !== "ask" || state.saving !== null) return;
    if (!("attemptId" in target)) {
      setState({ kind: "answered", helpful, justNow: true });
      return;
    }
    setState({ kind: "ask", error: null, saving: helpful });
    try {
      const saved = await saveFeedbackHelpful(target.attemptId, helpful);
      setState({ kind: "answered", helpful: saved.helpful, justNow: true });
    } catch (error) {
      const message = error instanceof ApiError && error.kind !== "http" ? error.userMessage : "We couldn't save your answer. Please try again.";
      setState({ kind: "ask", error: message, saving: null });
    }
  };

  return (
    <Card aria-labelledby={titleId} data-testid="feedback-helpful" className={cx("py-4 sm:py-4", className)}>
      {/* One live region for both states, so a screen reader hears the thank-you that replaces the question. */}
      <div role="status" aria-live="polite">
        {state.kind === "answered" ? (
          <p id={titleId} className="flex min-h-9 items-center gap-2 text-body text-fg" data-testid="feedback-helpful-thanks">
            <Icon name="check" size={16} className="shrink-0 text-fg-subtle" />
            {state.justNow ? (
              <span>
                <span className="font-medium">{HELPFUL_THANKS}</span> <span className="text-fg-muted">{THANKS_NOTE}</span>
              </span>
            ) : (
              <span className="text-fg-muted">{ANSWERED[state.helpful ? "yes" : "no"]}</span>
            )}
          </p>
        ) : null}
      </div>
      {state.kind === "ask" && (
        <div role="group" aria-labelledby={titleId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <h2 id={titleId} className="text-body font-medium text-fg">
            {HELPFUL_QUESTION}
          </h2>
          <div className="flex gap-2">
            {([true, false] as const).map((helpful) => (
              <PillAction
                key={String(helpful)}
                variant="quiet"
                size="md"
                className="min-w-20"
                testId={helpful ? "feedback-helpful-yes" : "feedback-helpful-no"}
                disabled={!hydrated || state.saving !== null}
                onClick={() => void answer(helpful)}
              >
                {state.saving === helpful ? "Saving…" : helpful ? "Yes" : "No"}
              </PillAction>
            ))}
          </div>
          {state.error && (
            <p role="alert" className="w-full text-label text-fg" data-testid="feedback-helpful-error">
              {state.error}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
