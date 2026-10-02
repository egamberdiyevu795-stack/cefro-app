import { Badge } from "@/components/ui/Badge";
import { Card, SectionTitle } from "@/components/ui/Card";
import type { AttemptSummary } from "@/domain/speaking/attempt";
import { formatDateTime } from "../lib/format";

const STATUS_LABEL: Record<AttemptSummary["status"], string> = {
  uploaded: "Processing",
  processing: "Processing",
  transcribing: "Processing",
  evaluating: "Processing",
  completed: "Completed",
  failed: "Needs attention",
};

/** Previous attempts on this task, so students can return to feedback after a reload. */
export function AttemptHistory({
  attempts,
  isLoading,
  onOpen,
  openingId,
}: {
  attempts: AttemptSummary[];
  isLoading: boolean;
  onOpen: (attemptId: string) => void;
  openingId: string | null;
}) {
  return (
    <Card>
      <SectionTitle>Your attempts</SectionTitle>
      {isLoading ? (
        <p className="mt-2 text-sm text-subtle">Loading…</p>
      ) : attempts.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No attempts yet. Your first answer and feedback will appear here.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {attempts.map((attempt) => (
            <li key={attempt.id}>
              <button
                type="button"
                onClick={() => onOpen(attempt.id)}
                disabled={openingId !== null}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-3 text-left hover:bg-surface-muted disabled:opacity-60"
              >
                <span>
                  <span className="block font-medium">
                    Attempt {attempt.attemptNumber}
                    {openingId === attempt.id && <span className="ml-2 text-xs text-subtle">opening…</span>}
                  </span>
                  <span className="block text-xs text-subtle">{formatDateTime(attempt.createdAt)}</span>
                </span>
                {attempt.overallLevel ? (
                  <Badge tone="brand">{attempt.overallLevel}</Badge>
                ) : (
                  <Badge tone={attempt.status === "failed" ? "danger" : "neutral"}>{STATUS_LABEL[attempt.status]}</Badge>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
