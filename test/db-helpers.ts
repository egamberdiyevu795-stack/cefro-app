import type { Db } from "@/server/db/client";
import { analyticsEvents, practiceSessions, speakingAttempts, speakingTasks, users } from "@/server/db/schema";

export const TASK_ID = "b2-part2-advice-from-someone";

/** Insert users (idempotent) and the task snapshot that attempts must reference. */
export async function seedUsers(db: Db, ...ids: string[]) {
  await db.insert(users).values(ids.map((id) => ({ id }))).onConflictDoNothing().run();
  await db.insert(speakingTasks)
    .values({ id: TASK_ID, version: 1, level: "B2", part: 2, title: "t", content: {} })
    .onConflictDoNothing()
    .run();
  await db.insert(speakingTasks)
    .values({ id: "other-task", version: 1, level: "B2", part: 2, title: "t2", content: {} })
    .onConflictDoNothing()
    .run();
}

let counter = 0;

/** Insert an attempt row directly (bypassing the service) with the given fields. */
export async function seedAttempt(
  db: Db,
  input: Partial<typeof speakingAttempts.$inferInsert> & { userId: string },
) {
  counter += 1;
  const id = input.id ?? `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
  const createdAt = input.createdAt ?? new Date().toISOString();
  await db.insert(speakingAttempts)
    .values({
      id,
      taskId: TASK_ID,
      taskVersion: 1,
      attemptNumber: counter,
      status: "completed",
      updatedAt: createdAt,
      ...input,
      createdAt,
    })
    .run();
  return id;
}

export async function seedSession(db: Db, userId: string, id: string) {
  await db.insert(practiceSessions).values({ id, userId }).run();
  return id;
}

export async function allEvents(db: Db) {
  return await db.select().from(analyticsEvents).all();
}
