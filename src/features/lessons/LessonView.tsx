import Link from "next/link";
import { Card, CardHeader, DemoLabel, Icon, cx, styles } from "@/components/ds";
import type { Lesson } from "@/content/lessons";
import { LessonPractice } from "./LessonPractice";
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
  /** The goal the retry carries (the result's first retry focus). */
  goal: { objective: string; check: string | null } | null;
  /** "Retry with this goal": the practice page as a retry of the result's attempt. */
  retryHref: string;
  /** Back to the result the lesson came from. */
  resultHref: string;
  /** Mock data: the demo label. */
  demo: boolean;
}

export function LessonView({ lesson, why, task, goal, retryHref, resultHref, demo }: LessonViewProps) {
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

      <LessonBody lesson={lesson} />

      <LessonPractice drill={lesson.drill} retry={{ intro: lesson.retry.intro, reminder: lesson.retry.reminder }} goal={goal} retryHref={retryHref} />
    </div>
  );
}

/** How it works and the examples: the lesson itself, the same for students and (read-only) teachers. */
function LessonBody({ lesson }: { lesson: Lesson }) {
  return (
    <>
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
    </>
  );
}

/**
 * The same lesson, read-only, for a teacher (Teacher view: a class's common problem links here): the title, how it
 * works and the examples. No "why" (it is filled from one student's result), no drill recorder and no Retry, so no
 * black button.
 */
export function TeacherLessonView({ lesson, backHref, demo }: { lesson: Lesson; backHref: string; demo: boolean }) {
  return (
    <div className="mx-auto grid max-w-2xl grid-cols-1 gap-4" data-testid="lesson">
      <Link href={backHref} className={cx("inline-flex min-h-11 items-center gap-1 justify-self-start text-label text-fg-muted hover:text-fg", styles.FOCUS_RING)}>
        <Icon name="chevronDown" size={14} className="rotate-90" />
        Class
      </Link>
      <Card aria-labelledby="lesson-title">
        {demo && <DemoLabel variant="class" className="mb-3" />}
        <p className="text-caption text-fg-muted">Lesson · read-only</p>
        <h1 id="lesson-title" className="mt-2 text-title font-medium tracking-[-0.01em] text-fg">
          {lesson.title}
        </h1>
        <p className="mt-2 text-body text-fg-muted">Students open this lesson from their result, practise its drill and retry with their goal.</p>
      </Card>
      <LessonBody lesson={lesson} />
    </div>
  );
}
