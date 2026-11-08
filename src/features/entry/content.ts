/**
 * The signed-out pages' words (home, sign in, Create account) and their links. Pure and browser-safe.
 * No claim about the app beyond what it does: no numbers, ratings, testimonials, "free", Passed/Failed or age claims.
 * The pages speak about the whole exam; which parts are open comes only from the release switches (`examStatus`).
 */
import { PART_LIVE } from "@/config/features";
import type { ExamPartId } from "@/domain/speaking/exam-part";
import { mockLink } from "@/features/demo/demo-mode";

export const HOME = {
  eyebrow: "UZBMB multilevel speaking",
  heading: "Know exactly what to fix before your speaking exam",
  line: "Answer exam-style questions out loud, see your own words quoted, fix one thing and try again.",
  start: "Start practising",
  demo: "See a demo result",
  signIn: "Sign in",
  steps: [
    { icon: "mic", title: "Speak like in the exam", detail: "Exam-style questions, pictures and timing." },
    { icon: "quote", title: "See your own words quoted", detail: "What worked and what to improve." },
    { icon: "retry", title: "Fix one thing, then retry", detail: "See whether it worked." },
  ],
  /** The last line of the page, small and grey, under the status list (Asadbek, 2026-11-08). No other claim. */
  builtBy: "Built by a student in Tashkent for UZBMB candidates.",
} as const;

export const SIGN_IN = { heading: "Welcome back", switchText: "New here?", switchLink: "Create account" } as const;

export const REGISTER = {
  heading: "Save your results",
  line: "Your answers, feedback and progress stay in your account, so you can see if you improve.",
  switchText: "Have an account?",
  switchLink: "Sign in",
} as const;

/**
 * "See a demo result": a real demo result page in mock mode (the demo student's first answer on "A tradition", scored
 * by the existing mock evaluator through the real `evaluateSpeaking`). Always mock: nothing is read or saved.
 */
export const DEMO_HREF = "/result?demo=demo-5&mock=1";

/* ── Which exam parts are open ───────────────────────────────────────────────────────────────────────────────── */

export const ALL_PARTS_OPEN = "All three parts are open.";
export const OPEN = "Open";
export const COMING_SOON = "Coming soon";

/** The exam's three parts as the home page names them, and the release switches each one needs. */
const STATUS_PARTS: readonly { label: string; needs: readonly ExamPartId[] }[] = [
  { label: "Part 1 · A1–B1", needs: ["1.1", "1.2"] },
  { label: "Part 2 · B2", needs: ["2"] },
  { label: "Part 3 · C1", needs: ["3"] },
];

export type ExamStatus =
  | { kind: "all-open"; text: typeof ALL_PARTS_OPEN }
  | { kind: "list"; rows: { label: string; open: boolean; status: typeof OPEN | typeof COMING_SOON }[] };

/**
 * The home page's status list, from the same switches as the dashboard's part tiles (`PART_LIVE`), so it can never
 * be wrong. Part 1 is open only when both halves (1.1 and 1.2) are live. When every part is open: one line, and no
 * "Coming soon" anywhere.
 */
export function examStatus(live: Readonly<Record<ExamPartId, boolean>> = PART_LIVE): ExamStatus {
  const rows = STATUS_PARTS.map(({ label, needs }) => {
    const open = needs.every((part) => live[part]);
    return { label, open, status: open ? OPEN : COMING_SOON } as const;
  });
  if (rows.every((row) => row.open)) return { kind: "all-open", text: ALL_PARTS_OPEN };
  return { kind: "list", rows };
}

/**
 * `/login` or `/register`, keeping where to go after signing in (`?next=`, only when it is not the default `/`) and mock
 * mode (`?mock=1`).
 */
export function entryHref(path: "/login" | "/register", { next = "/", mock = false }: { next?: string; mock?: boolean } = {}): string {
  const href = next === "/" ? path : `${path}?next=${encodeURIComponent(next)}`;
  return mockLink(href, mock);
}
