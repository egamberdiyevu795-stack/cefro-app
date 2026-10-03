import type { Db } from "@/server/db/client";
import { analyticsEvents, practiceSessions, speakingAttempts, speakingTasks, users } from "@/server/db/schema";

export const TASK_ID = "b2-part2-technology-young-people";

/** Insert users (idempotent) and the task snapshot that attempts must reference. */
export function seedUsers(db: Db, ...ids: string[]) {
  db.insert(users).values(ids.map((id) => ({ id }))).onConflictDoNothing().run();
  db.insert(speakingTasks)
    .values({ id: TASK_ID, version: 1, level: "B2", part: 2, title: "t", content: {} })
    .onConflictDoNothing()
    .run();
  db.insert(speakingTasks)
    .values({ id: "other-task", version: 1, level: "B2", part: 2, title: "t2", content: {} })
    .onConflictDoNothing()
    .run();
}

let counter = 0;

/** Insert an attempt row directly (bypassing the service) with the given fields. */
export function seedAttempt(
  db: Db,
  input: Partial<typeof speakingAttempts.$inferInsert> & { userId: string },
) {
  counter += 1;
  const id = input.id ?? `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`;
  const createdAt = input.createdAt ?? new Date().toISOString();
  db.insert(speakingAttempts)
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

export function seedSession(db: Db, userId: string, id: string) {
  db.insert(practiceSessions).values({ id, userId }).run();
  return id;
}

export function allEvents(db: Db) {
  return db.select().from(analyticsEvents).all();
}
