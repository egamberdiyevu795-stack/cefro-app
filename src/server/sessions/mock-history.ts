import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { effectiveMockStatus } from "@/domain/speaking/full-mock";
import type { HistoryMock } from "@/domain/speaking/history";
import { getDb } from "@/server/db/client";
import { practiceSessions } from "@/server/db/schema";
import { expireStaleMocks } from "./mock-service";

/**
 * The caller's full mock exams for the History page, newest first (docs/v1-plan.md, step 4). Only rows recorded under the
 * caller's own user id are read, and the 24-hour rule is applied first, so a mock left open is "not_finished" here exactly as
 * on the mock result page. Each mock's parts are the History attempts whose `sessionId` is its id.
 */
export async function listMockHistory(userId: string, now = Date.now()): Promise<HistoryMock[]> {
  await expireStaleMocks(userId, now);
  const db = await getDb();
  const rows = await db
    .select()
    .from(practiceSessions)
    .where(and(eq(practiceSessions.userId, userId), eq(practiceSessions.kind, "full_mock")))
    .orderBy(desc(practiceSessions.createdAt), desc(practiceSessions.id))
    .all();
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    status: effectiveMockStatus({ status: row.status ?? "in_progress", createdAt: row.createdAt }, now),
    classMockId: row.classMockId,
  }));
}
