"use client";

import { useState } from "react";
import { Card, CardHeader, PillButton, cx, styles } from "@/components/ds";
import type { Lesson } from "@/content/lessons";
import { DrillRecorder, type SelfCheck } from "./DrillRecorder";
import { Rich } from "./Rich";

/** "Q3", or "Q1–Q3" for a prompt that practises a run of questions. */
export function practisesLabel(questions: readonly number[]): string {
  const sorted = [...questions].sort((a, b) => a - b);
  return sorted.length > 1 ? `Q${sorted[0]}–Q${sorted[sorted.length - 1]}` : `Q${sorted[0]}`;
}

/**
 * The lesson's drill and its retry, together because the retry card shows "Ready for your retry" once every drill
 * prompt is marked Yes. The answers live only in this page: nothing is saved or uploaded, and they reset when it closes.
 */
export function LessonPractice({
  drill,
  retry,
  goal,
  retryHref,
}: {
  drill: Lesson["drill"];
  retry: Pick<Lesson["retry"], "intro" | "reminder">;
  goal: { objective: string; check: string | null } | null;
  retryHref: string;
}) {
  const [answers, setAnswers] = useState<SelfCheck[]>(() => drill.items.map(() => "none"));
  const allDone = answers.every((a) => a === "yes");
  const answer = (index: number) => (value: SelfCheck) => setAnswers((all) => all.map((a, i) => (i === index ? value : a)));

  return (
    <>
      <Card aria-labelledby="drill-title">
        <CardHeader id="drill-title" title="Self-check drill" />
        <p className="text-body text-fg">{drill.intro}</p>
        {/* The drill's own made-up topic: the same for every retry task. L-T8's picture is a description; there is no image. */}
        <div className="mt-3 rounded-tile bg-well p-3" data-testid="drill-topic">
          <p className="text-body text-fg">
            <Rich text={drill.topic.intro} />
          </p>
          <ol className="mt-2 space-y-1 text-label text-fg-muted">
            {drill.topic.questions.map((q, i) => (
              <li key={q}>
                Q{i + 1} {q}
              </li>
            ))}
          </ol>
          {drill.topic.picture && <p className="mt-2 text-label text-fg-muted">{drill.topic.picture}</p>}
        </div>
        <ul className="mt-3 divide-y divide-line border-t border-line">
          {drill.items.map((item, i) => (
            <li key={item.prompt} className="flex gap-3 py-4" data-testid="drill-prompt">
              <span className="flex h-6 min-w-9 shrink-0 items-center justify-center rounded-full bg-well px-2 text-label font-semibold text-fg">
                <span className="sr-only">Practises </span>
                {practisesLabel(item.practises)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-body text-fg">
                  <Rich text={item.prompt} />
                </p>
                <p className="mt-1 text-label text-fg-muted">{item.seconds} s</p>
                <div className="mt-2">
                  <DrillRecorder seconds={item.seconds} label={`prompt ${practisesLabel(item.practises)}`} check={item.check} answer={answers[i]} onAnswer={answer(i)} />
                </div>
              </div>
            </li>
          ))}
        </ul>
        <fieldset className="mt-2 rounded-tile bg-well p-3">
          <legend className="float-left text-caption font-semibold text-fg">Checklist</legend>
          <ul className="clear-left pt-1">
            {drill.checklist.map((item) => (
              <li key={item}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 text-body text-fg">
                  <input type="checkbox" className={cx("size-5 shrink-0 accent-primary", styles.FOCUS_RING)} />
                  <span>
                    <Rich text={item} />
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      </Card>

      <Card aria-labelledby="retry-title">
        <CardHeader id="retry-title" title="Retry the same task" />
        <p className="text-body text-fg">{retry.intro}</p>
        {goal && (
          <div className="mt-4 rounded-tile bg-well p-3" data-testid="lesson-goal">
            <p className="text-caption font-semibold text-fg">Goal for your retry</p>
            <p className="mt-1 text-body text-fg">{goal.objective}</p>
            {goal.check && <p className="mt-2 text-label text-fg-muted">You&rsquo;ll know it worked: {goal.check}</p>}
          </div>
        )}
        <p className="mt-3 text-body text-fg">
          <span className="font-semibold">Remember:</span> {retry.reminder}
        </p>
        <div className="mt-5">
          {allDone && (
            <p role="status" className="mb-2 text-body font-semibold text-fg" data-testid="ready-for-retry">
              Ready for your retry
            </p>
          )}
          <PillButton href={retryHref} icon="retry" size="lg" className="w-full sm:w-auto">
            Retry with this goal
          </PillButton>
        </div>
      </Card>
    </>
  );
}
