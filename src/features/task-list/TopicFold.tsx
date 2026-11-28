"use client";

import { useEffect, useRef } from "react";
import { Icon, cx, styles } from "@/components/ds";

/**
 * The part's topic list, folded away behind one line ("Or choose a topic · 2 of 7 practised"). Closed, every part card
 * is the same height whatever its list holds (Part 3 has 20 topics, Part 2 has 7), so the page reads as four equal
 * cards and "Random topic" stays the way in, as in the exam.
 *
 * A plain <details>, so it opens and closes with no JavaScript. The one script: the part linked from elsewhere
 * (a Home part tile, "/practice#part-2") opens its own list, so the student lands on what they came for.
 */
export function TopicFold({ anchor, summary, count, children }: { anchor: string; summary: string; count?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const openIfLinked = () => {
      if (ref.current && window.location.hash === `#${anchor}`) ref.current.open = true;
    };
    openIfLinked();
    window.addEventListener("hashchange", openIfLinked);
    return () => window.removeEventListener("hashchange", openIfLinked);
  }, [anchor]);

  return (
    <details ref={ref} className="group mt-5" data-testid="topic-fold">
      <summary
        className={cx(
          "flex cursor-pointer list-none items-baseline justify-between gap-3 rounded-tile py-2 text-label marker:hidden hover:text-fg [&::-webkit-details-marker]:hidden",
          styles.FOCUS_RING,
        )}
        data-testid="choose-topic"
      >
        <span className="flex items-center gap-1.5 font-medium text-fg">
          <Icon name="chevronDown" size={16} className="shrink-0 text-fg-subtle transition-transform group-open:rotate-180" />
          {summary}
        </span>
        {count && <span className="text-fg-muted">{count}</span>}
      </summary>
      {children}
    </details>
  );
}
