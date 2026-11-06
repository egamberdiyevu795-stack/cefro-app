import "server-only";
import { eq } from "drizzle-orm";
import { examDateProblem } from "@/domain/exam-date";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { HttpError } from "@/server/errors";
import { nowIso } from "@/server/ids";

/** The user's stored exam date and Skip, or nothing stored (also for an unknown user). */
export async function readExamDate(userId: string): Promise<{ examDate: string | null; examDateSkippedAt: string | null }> {
  const row = await (await getDb())
    .select({ examDate: users.examDate, examDateSkippedAt: users.examDateSkippedAt })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  return { examDate: row?.examDate ?? null, examDateSkippedAt: row?.examDateSkippedAt ?? null };
}

/** Save the user's exam date (today or later). Saving clears an earlier Skip. */
export async function saveExamDate(userId: string, date: unknown, now = new Date()): Promise<void> {
  const problem = examDateProblem(date, now);
  if (problem) throw new HttpError(400, "invalid_exam_date", problem);
  await (await getDb()).update(users).set({ examDate: date as string, examDateSkippedAt: null }).where(eq(users.id, userId)).run();
}

/** "Skip": stop asking. A date saved earlier is kept (it is simply past, or the student is asked again after it). */
export async function skipExamDate(userId: string): Promise<void> {
  await (await getDb()).update(users).set({ examDateSkippedAt: nowIso() }).where(eq(users.id, userId)).run();
}
