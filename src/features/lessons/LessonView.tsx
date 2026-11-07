import Link from "next/link";
import { Card, CardHeader, DemoLabel, Icon, PillButton, cx, styles } from "@/components/ds";
import type { Lesson } from "@/content/lessons";
import { DrillRecorder } from "./DrillRecorder";
import { Rich } from "./Rich";

/*
 * The lesson screen, phone first, top to bottom (docs/teaching-plan.md, section 3):
 * why this lesson → explanation → examples (weaker → better) → self-check drill → the retry with the goal carried over.
 * Built only from components/ds and the design-system tokens. One black button: "Retry with this goal".
 * The lesson's own text is shown exactly as written (`Rich` only turns its **bold** / *italic* into emphasis).
 */

export interface LessonViewProps {
  lesson: Lesson;
  /** "Why this lesson", filled from the result. */
  why: string;
  /** The task being retried. */
  task: { title: string };
  /** The task the drill prompts were written for, when it is not the task being retried. */
  drillTask: { title: string } | null;
  /** The goal the retry carries (the result's first retry focus). */
  goal: { objective: string; check: string | null } | null;
  /** "Retry with this goal": the practice page as a retry of the result's attempt. */
  retryHref: string;
  /** Back to the result the lesson came from. */
  resultHref: string;
  /** Mock data: the demo label. */
  demo: boolean;
}

export function LessonView({ lesson, why, task, drillTask, goal, retryHref, resultHref, demo }: LessonViewProps) {
  return (
    <div className="mx-auto grid max-w-2xl grid-cols-1 gap-4" data-testid="lesson">
      <Link href={resultHref} className={cx("inline-flex min-h-11 items-center gap-1 justify-self-start text-label text-fg-muted hover:text-fg", styles.FOCUS_RING)}>
        <Icon name="chevronDown" size={14} className="rotate-90" />
        Your result
      </Link>

      {/* The header row leaves room on the right for the mascot, once there is one. */}
      <Card aria-labelledby="lesson-title">
        {demo && <DemoLabel variant="mode" className="mb-3" />}
        <p className="text-caption text-fg-muted">Lesson for your biggest fix · {task.title}</p>
        <h1 id="lesson-title" className="mt-2 text-title font-medium tracking-[-0.01em] text-fg">
          {lesson.title}
        </h1>
        <h2 className="mt-5 text-caption font-semibold text-fg">Why this lesson</h2>
        <p className="mt-1 rounded-tile bg-well p-3 text-body text-fg" data-testid="lesson-why">
          {why}
        </p>
      </Card>

      <Card aria-labelledby="explanation-title">
        <CardHeader id="explanation-title" title="How it works" />
        <div className="space-y-3 text-body text-fg">
          {lesson.explanation.map((block, i) =>
            block.kind === "p" ? (
              <p key={i}>
                <Rich text={block.text} />
              </p>
            ) : (
              <ol key={i} className="list-decimal space-y-1 pl-5">
                {block.items.map((item) => (
                  <li key={item}>
                    <Rich text={item} />
                  </li>
                ))}
              </ol>
            ),
          )}
        </div>
      </Card>

      <Card aria-labelledby="examples-title">
        <CardHeader id="examples-title" title="Examples" action={<span className="text-label text-fg-muted">Weaker → better</span>} />
        <p className="text-label text-fg-muted">
          <Rich text={lesson.madeUpNote} />
        </p>
        <div className="mt-3 rounded-tile bg-well p-3">
          <p className="text-body text-fg">
            <Rich text={lesson.exampleTopic.intro} />
          </p>
          <ol className="mt-2 space-y-1 text-label text-fg-muted">
            {lesson.exampleTopic.questions.map((q, i) => (
              <li key={q}>
                Q{i + 1} {q}
              </li>
            ))}
          </ol>
          {lesson.exampleTopic.picture && <p className="mt-2 text-label text-fg-muted">{lesson.exampleTopic.picture}</p>}
          <p className="mt-2 text-label text-fg-muted">{lesson.exampleTopic.note}</p>
        </div>
        <ol className="mt-2 divide-y divide-line">
          {lesson.examples.map((example, i) => (
            <li key={example.weaker} className="py-4" data-testid="lesson-example">
              <p className="flex items-baseline justify-between gap-3">
                <span className="text-body font-semibold text-fg">
                  {i + 1}. <Rich text={example.problem} />
                </span>
                <span className="shrink-0 text-caption text-fg-muted">Made up</span>
              </p>
              <p className="mt-2 text-caption font-semibold text-fg-muted">Weaker</p>
              <blockquote className="mt-1 border-l-2 border-line pl-3 text-body text-fg-muted">“{example.weaker}”</blockquote>
              <p className="mt-2 text-caption font-semibold text-fg">Better</p>
              <blockquote className="mt-1 border-l-2 border-accent pl-3 text-body text-fg">“{example.better}”</blockquote>
              <p className="mt-2 text-label text-fg-muted">
                <Rich text={example.note} />
              </p>
            </li>
          ))}
        </ol>
      </Card>

      <Card aria-labelledby="drill-title">
        <CardHeader id="drill-title" title="Self-check drill" />
        <p className="text-body text-fg">{lesson.drill.intro}</p>
        {drillTask && (
          <p className="mt-2 text-label text-fg-muted">
            These prompts are about &ldquo;{drillTask.title}&rdquo;. Practise the skill on them, then use it in your retry of &ldquo;{task.title}&rdquo;.
          </p>
        )}
        <ol className="mt-3 divide-y divide-line border-t border-line">
          {lesson.drill.items.map((item, i) => (
            <li key={item.prompt} className="flex gap-3 py-4">
              <span className="w-4 shrink-0 text-body font-semibold text-fg">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-body text-fg">
                  <Rich text={item.prompt} />
                </p>
                <p className="mt-1 text-label text-fg-muted">{item.seconds} s</p>
                <div className="mt-2">
                  <DrillRecorder seconds={item.seconds} label={`prompt ${i + 1}`} />
                </div>
              </div>
            </li>
          ))}
        </ol>
        <fieldset className="mt-2 rounded-tile bg-well p-3">
          <legend className="float-left text-caption font-semibold text-fg">Checklist</legend>
          <ul className="clear-left pt-1">
            {lesson.drill.checklist.map((item) => (
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
        <p className="text-body text-fg">{lesson.retry.intro}</p>
        {goal && (
          <div className="mt-4 rounded-tile bg-well p-3" data-testid="lesson-goal">
            <p className="text-caption font-semibold text-fg">Goal for your retry</p>
            <p className="mt-1 text-body text-fg">{goal.objective}</p>
            {goal.check && <p className="mt-2 text-label text-fg-muted">You&rsquo;ll know it worked: {goal.check}</p>}
          </div>
        )}
        <p className="mt-3 text-body text-fg">
          <span className="font-semibold">Remember:</span> {lesson.retry.reminder}
        </p>
        <div className="mt-5">
          <PillButton href={retryHref} icon="retry" size="lg" className="w-full sm:w-auto">
            Retry with this goal
          </PillButton>
        </div>
      </Card>
    </div>
  );
}
