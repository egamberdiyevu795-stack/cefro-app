import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { practiceSessions } from "@/server/db/schema";
import { newId } from "@/server/ids";

/**
 * Practice sessions are created by the server and always belong to one user. The id is a correlation
 * key for attempts and analytics events; it grants no access to anything by itself, and a client that
 * sends someone else's (or an unknown) id is simply treated as having no session.
 */
export async function createPracticeSession(userId: string): Promise<string> {
  const id = newId();
  const db = await getDb();
  await db.insert(practiceSessions).values({ id, userId, kind: "single_task" }).run();
  return id;
}

/** The subset of `candidates` that are sessions owned by `userId`. */
export async function ownedSessionIds(userId: string, candidates: readonly string[]): Promise<Set<string>> {
  const unique = [...new Set(candidates)];
  if (unique.length === 0) return new Set();
  const db = await getDb();
  const rows = await db
    .select({ id: practiceSessions.id })
    .from(practiceSessions)
    .where(and(eq(practiceSessions.userId, userId), inArray(practiceSessions.id, unique)))
    .all();
  return new Set(rows.map((row) => row.id));
}

/** `candidate` if it is one of the user's sessions, otherwise null. */
export async function resolveOwnedSessionId(userId: string, candidate: string | null | undefined): Promise<string | null> {
  if (!candidate) return null;
  return (await ownedSessionIds(userId, [candidate])).has(candidate) ? candidate : null;
}
