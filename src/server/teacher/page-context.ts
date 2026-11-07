import "server-only";
import { notFound } from "next/navigation";
import { isMockQuery } from "@/features/demo/demo-mode";
import { asDemoTeacher } from "@/features/teacher/links";
import { assertServerConfigured } from "@/server/config/boot-check";
import { HttpError } from "@/server/errors";
import { findCurrentUserId } from "@/server/identity/current-user";
import { teacherLive } from "./release";
import { userRole } from "./teacher-store";

type Query = Record<string, string | string[] | undefined>;

export type TeacherPage =
  | { mock: true; href: (path: string) => string }
  | { mock: false; teacherId: string; href: (path: string) => string };

/**
 * Who is looking at a teacher page. `?mock=1`: the demo teacher (no configuration, cookie or database; every link
 * keeps `?mock=1&as=teacher`). Otherwise the real page: a 404 while the Teacher view is off (no parent consent yet),
 * and for anyone but a signed-in teacher (the same 404 as a stranger's result).
 */
export async function teacherPage(query: Query): Promise<TeacherPage> {
  if (isMockQuery(query)) return { mock: true, href: asDemoTeacher };
  if (!teacherLive()) notFound();
  assertServerConfigured();
  const userId = await findCurrentUserId();
  if (!userId || (await userRole(userId)) !== "teacher") notFound();
  return { mock: false, teacherId: userId, href: (path) => path };
}

/** A teacher-store 404 (not theirs, ended, closed) as the not-found screen; anything else is a real error. */
export async function orNotFound<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
}
