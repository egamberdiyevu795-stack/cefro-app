import "server-only";
import { eq } from "drizzle-orm";
import { nameProblem, normaliseName } from "@/domain/account";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { HttpError } from "@/server/errors";

/** What the Profile and Settings pages show about the caller's own account. Never another user's. */
export type AccountInfo =
  | { kind: "registered"; name: string | null; email: string; memberSince: string }
  | { kind: "anonymous"; memberSince: string | null };

/** The caller's account (by their own user id, from `findCurrentUserId`). An unknown id is an anonymous visitor. */
export async function readAccount(userId: string | null): Promise<AccountInfo> {
  if (!userId) return { kind: "anonymous", memberSince: null };
  const row = await (await getDb())
    .select({ kind: users.kind, name: users.name, email: users.email, createdAt: users.createdAt, mergedInto: users.mergedIntoUserId })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!row || row.kind !== "registered" || !row.email || row.mergedInto) return { kind: "anonymous", memberSince: row?.createdAt.toISOString() ?? null };
  return { kind: "registered", name: row.name?.trim() || null, email: row.email, memberSince: row.createdAt.toISOString() };
}

/** Save the account's display name (the name the Account menu shows). */
export async function saveName(userId: string, value: unknown): Promise<string> {
  const problem = nameProblem(value);
  if (problem) throw new HttpError(400, "invalid_name", problem);
  const name = normaliseName(value as string);
  await (await getDb()).update(users).set({ name, updatedAt: new Date() }).where(eq(users.id, userId)).run();
  return name;
}
