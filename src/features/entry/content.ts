/**
 * The signed-out pages' words (home, sign in, Create account) and their links. Pure and browser-safe.
 * No claim about the app beyond what it does; no Passed/Failed.
 */
import { mockLink } from "@/features/demo/demo-mode";

export const HOME = {
  heading: "Practise the multilevel speaking exam",
  line: "Speak, see your own words quoted, fix one thing, and try again.",
  /** A fixed example of the result page's Biggest fix card (not anyone's result). */
  example: {
    title: "Example feedback",
    fix: "Biggest fix: answer every question",
    detail: "You answered 2 of 3 questions. Question 3 asked for your opinion.",
  },
} as const;

/** "Try the demo": the demo student's dashboard in mock mode (nothing is read or saved). */
export const DEMO_HREF = "/dashboard?mock=1";

/**
 * `/login` or `/register`, keeping where to go after signing in (`?next=`, only when it is not the default `/`) and mock
 * mode (`?mock=1`).
 */
export function entryHref(path: "/login" | "/register", { next = "/", mock = false }: { next?: string; mock?: boolean } = {}): string {
  const href = next === "/" ? path : `${path}?next=${encodeURIComponent(next)}`;
  return mockLink(href, mock);
}
