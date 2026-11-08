import Link from "next/link";
import { Card, Icon, cx, styles } from "@/components/ds";
import type { Lesson } from "@/content/lessons";

/**
 * The Lessons list (`/lessons`): every approved lesson, by its title and the lesson file's own "Variant" field
 * ("Part 2 (B2)"). No other text: the lessons have no approved one-line summary, and none is invented here.
 * Each row opens its lesson. No black button: the list itself is the page.
 */
export function LessonList({ lessons, href }: { lessons: readonly Lesson[]; href: (lesson: Lesson) => string }) {
  return (
    <div className="mx-auto grid max-w-2xl grid-cols-1 gap-4" data-testid="lesson-list">
      <h1 className="text-title font-medium tracking-[-0.01em] text-fg">Lessons</h1>
      <Card aria-label="Lessons">
        <ul className="-my-1 divide-y divide-line">
          {lessons.map((lesson) => (
            <li key={lesson.slug}>
              <Link
                href={href(lesson)}
                className={cx("flex min-h-14 items-center gap-3 py-2.5 hover:text-fg", styles.FOCUS_RING)}
                data-testid="lesson-link"
              >
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-well text-fg">
                  <Icon name="book" size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body font-semibold text-fg">{lesson.title}</span>
                  <span className="block text-caption text-fg-muted">{lesson.variantLabel}</span>
                </span>
                <Icon name="chevronDown" size={16} className="-rotate-90 text-fg-subtle" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
