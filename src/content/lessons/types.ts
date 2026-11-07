/**
 * A lesson (docs/teaching-plan.md, section 3): one skill, one screen, then the retry of the same task.
 *
 * Text fields are the lesson file's wording, copied exactly (docs/lessons/drafts/*.md; a test checks every string
 * against its file). `**bold**` and `*italic*` are kept as written and rendered as emphasis.
 *
 * Only an `approved` lesson is ever shown to a student (decision 7). A draft can sit in the registry, but
 * `shownLessons` / `getShownLesson` never return it.
 */
export type LessonStatus = "draft" | "approved";

export interface LessonExample {
  /** The "Problem" column: what is wrong with the weaker version. */
  problem: string;
  weaker: string;
  better: string;
  note: string;
  /** Every example is made up for teaching (decision 7). */
  madeUp: true;
}

export interface LessonDrillItem {
  prompt: string;
  seconds: number;
  /** Which question(s) of the drill topic it practises, shown as its label ("Q3", "Q1–Q3"). */
  practises: (1 | 2 | 3)[];
  /**
   * The self-check after a recording ("Listen back. Did you: …?"): the prompt's own instruction, as exact pieces of
   * the approved prompt (a test checks each is in it). No new teaching wording.
   */
  check: string[];
}

/** A block of the explanation: a paragraph or a numbered list. */
export type LessonBlock = { kind: "p"; text: string } | { kind: "ol"; items: string[] };

/** "Why this lesson" templates, filled from the result. Placeholders: {n}, {question text}, {evidence quote}, {evaluator note}. */
export interface LessonWhy {
  /** The default line (L-T1: a missing question; L-T4: a `minimal` answer; L-T8: a picture-only answer). */
  default: string;
  /** L-T4 only: the line for a `partial` answer. */
  partial?: string;
}

export interface Lesson {
  /** Stable lesson id from the teaching plan, e.g. "L-T4". */
  id: string;
  /** In the address: /lessons/<slug>. */
  slug: string;
  /** The level variant, when the lesson has several (L-T4: B1 / B2 / C1). */
  variant?: "B1" | "B2" | "C1";
  /** The lesson file's "Variant" field, as written, e.g. "Part 2 (B2)". */
  variantLabel: string;
  /** Bumped on any content change, like tasks. */
  version: number;
  title: string;
  targetLevel: "A2" | "B1" | "B2" | "C1" | "above_C1";
  /** The P-… problem codes it covers (teaching-plan section 1). */
  problems: string[];
  /** Exam parts it is used for. */
  parts: (1.1 | 1.2 | 2 | 3)[];
  status: LessonStatus;
  draftedBy: "ai" | "human";
  writtenAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  /** The lesson file it comes from (repository path). */
  source: string;
  /** "All examples in this lesson are made up…" */
  madeUpNote: string;
  why: LessonWhy;
  /** At most ~120 words (teaching-plan section 3). */
  explanation: LessonBlock[];
  /** The examples' own topic: never the topic of the task being retried (checked for every Part 2 task). */
  exampleTopic: {
    /** "Example topic (made up, **not** the retry task): *"…"*" */
    intro: string;
    title: string;
    questions: [string, string, string];
    /** L-T8: the made-up picture of the example topic. */
    picture?: string;
    /** "The examples never use the advice topic, so lesson sentences can't be copied into the retry." */
    note: string;
  };
  examples: LessonExample[];
  drill: {
    /** "Record each prompt, listen back, then tick the checklist. Self-check only, no AI scoring." */
    intro: string;
    /**
     * The drill's own made-up topic (docs/lessons/drill-drafts.md, approved): never one of the Part 2 tasks, so the same
     * drill is shown whatever task is retried.
     */
    topic: {
      /** "Drill topic (made up): *"…"*" */
      intro: string;
      title: string;
      questions: [string, string, string];
      /** "Drill picture (made up): …": a description only, there is no image. */
      picture?: string;
    };
    items: LessonDrillItem[];
    /** The lesson file's checklist: kept, but not shown (covered by the per-prompt self-checks). */
    checklist: string[];
  };
  retry: {
    /** "Same task, same timings: …" */
    intro: string;
    /** Same wording as the evaluator's retry focus, so the goal the retry carries is this one. */
    objective: string;
    successCheck: string;
    reminder: string;
  };
}
