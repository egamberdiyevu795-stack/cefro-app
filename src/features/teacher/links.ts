/**
 * Addresses of the Teacher view and of the student's Join / Share screens. In mock mode every link keeps `?mock=1`,
 * and the demo teacher's links also keep `as=teacher` (the demo teacher's Home and Account page). Pure, browser-safe.
 */
import { withMock } from "@/features/demo/demo-mode";

/** The query switch that shows the demo teacher (with `?mock=1` only). */
export const AS_PARAM = "as";
export const AS_TEACHER = "teacher";

type Query = Record<string, string | string[] | undefined>;

/** `?mock=1&as=teacher`: the demo teacher's Home and Account page. */
export function isDemoTeacherQuery(query: Query): boolean {
  const as = query[AS_PARAM];
  return (Array.isArray(as) ? as[0] : as) === AS_TEACHER;
}

/** A link of the demo teacher: `?mock=1&as=teacher`. */
export function asDemoTeacher(href: string): string {
  const url = new URL(withMock(href), "http://mock.invalid");
  url.searchParams.set(AS_PARAM, AS_TEACHER);
  return `${url.pathname}${url.search}${url.hash}`;
}

export const teacherLinks = {
  home: "/dashboard",
  newClass: "/teacher/classes/new",
  cls: (classId: string) => `/teacher/classes/${encodeURIComponent(classId)}`,
  student: (classId: string, memberId: string) => `/teacher/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(memberId)}`,
  attempt: (classId: string, attemptId: string) => `/teacher/classes/${encodeURIComponent(classId)}/attempts/${encodeURIComponent(attemptId)}`,
  /** T6: a student's full mock. */
  mock: (classId: string, mockId: string) => `/teacher/classes/${encodeURIComponent(classId)}/mocks/${encodeURIComponent(mockId)}`,
  /** The page a student opens from a Telegram link: the join code pre-filled. */
  join: (code: string) => `/join/${encodeURIComponent(code)}`,
  /** An approved lesson, read-only, opened from a class's common problems. */
  lesson: (classId: string, slug: string) => `/teacher/lessons/${encodeURIComponent(slug)}?${new URLSearchParams({ class: classId })}`,
};

/** The teacher's own audio route for one attempt (never the student's route). Plays only; no download. */
export function teacherAudioHref(classId: string, attemptId: string): string {
  return `/api/teacher/classes/${encodeURIComponent(classId)}/attempts/${encodeURIComponent(attemptId)}/audio`;
}

export const studentLinks = {
  account: "/profile",
  join: "/profile/classes/join",
  share: (code: string) => `/profile/classes/join?${new URLSearchParams({ code })}`,
};

/** The link as the page needs it: mock mode keeps `?mock=1` (and the demo teacher's `as=teacher`). */
export function teacherHref(href: string, mode: { mock: boolean; demoTeacher?: boolean }): string {
  if (!mode.mock) return href;
  return mode.demoTeacher ? asDemoTeacher(href) : withMock(href);
}
