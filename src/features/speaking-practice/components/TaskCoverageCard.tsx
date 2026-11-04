import { Card, SectionTitle } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import type { QuestionAssessment } from "@/domain/evaluation/multilevel/model-output";
import type { PublicSpeakingTask } from "@/domain/speaking/task";

const STATUS = {
  on_topic: { icon: "✓", label: "Answered", className: "bg-success-soft text-success" },
  partial: { icon: "!", label: "On topic, but only partly answered", className: "bg-warning-soft text-warning" },
  missing: { icon: "✗", label: "Not answered", className: "bg-danger-soft text-danger" },
  off_topic: { icon: "✗", label: "Off topic", className: "bg-danger-soft text-danger" },
} as const;

/** Which questions the answer addressed, numbered as the student saw them (Question 1, 2, 3). */
export function TaskCoverageCard({ task, questions }: { task: PublicSpeakingTask; questions: QuestionAssessment[] }) {
  return (
    <Card>
      <SectionTitle>Did you answer every point?</SectionTitle>
      <ul className="mt-3 space-y-3">
        {questions.map((item) => {
          const status = STATUS[item.status];
          return (
            <li key={item.id} className="flex gap-3" data-testid={`question-${item.id}`}>
              <span
                className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold", status.className)}
                aria-label={status.label}
                role="img"
              >
                {status.icon}
              </span>
              <div>
                <p className="text-sm font-medium">
                  Question {item.id}: {task.prompts[item.id - 1]}
                </p>
                <p className="text-sm text-muted">{item.note}</p>
                {item.model_answer && item.status !== "on_topic" && (
                  <p className="mt-1 text-sm">
                    <span className="text-subtle">Example: </span>&ldquo;{item.model_answer}&rdquo;
                  </p>
                )}
                {item.status === "partial" && (
                  <p className="mt-1 text-xs font-medium text-warning">
                    Counts as on topic, but a fuller answer (a direct answer plus a reason or example) is safer.
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
