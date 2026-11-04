import Image from "next/image";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import type { PublicSpeakingTask } from "@/domain/speaking/task";

/**
 * The topic, the task picture and the numbered questions. Reused in brief, preparation, recording and retry, so the
 * picture is always shown together with the questions: beside them when the card is wide enough (a container query on
 * the card, not the screen width), above them on a phone. Numbering is 1-based everywhere.
 */
export function TaskQuestion({ task, compact = false }: { task: PublicSpeakingTask; compact?: boolean }) {
  const questions = (
    <div className="min-w-0">
      <p className={cn("text-xs font-semibold uppercase tracking-wide text-subtle", !task.picture && "mt-4")}>
        Answer all {task.prompts.length} questions
      </p>
      <ol className="mt-2 space-y-2">
        {task.prompts.map((prompt, i) => (
          <li key={prompt} className="flex gap-3 leading-relaxed">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand-strong">
              {i + 1}
            </span>
            <span>
              <span className="sr-only">Question {i + 1}: </span>
              {prompt}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );

  return (
    <Card className={cn("@container", compact && "p-4 sm:p-5")}>
      <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Topic</p>
      <p className={cn("mt-2 font-medium leading-relaxed", compact ? "text-base" : "text-lg")}>{task.question}</p>
      {task.picture ? (
        <div data-testid="task-picture-layout" className="mt-4 flex flex-col gap-4 @lg:flex-row @lg:items-start">
          <figure data-testid="task-picture" className="w-full max-w-sm shrink-0 @lg:w-56 @2xl:w-64">
            <Image
              src={task.picture.src}
              alt={task.picture.alt}
              width={task.picture.width}
              height={task.picture.height}
              priority
              className="h-auto w-full rounded-lg border border-border"
            />
            <figcaption className="mt-1.5 text-xs text-subtle">You don&apos;t need to describe the picture</figcaption>
          </figure>
          {questions}
        </div>
      ) : (
        questions
      )}
    </Card>
  );
}
