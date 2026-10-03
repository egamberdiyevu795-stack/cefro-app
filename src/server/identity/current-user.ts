import "server-only";
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { getAuth } from "@/server/auth/auth";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { HttpError } from "@/server/errors";
import { newId } from "@/server/ids";
import { logger } from "@/server/logging/logger";
import { USER_COOKIE_MAX_AGE_SECONDS, USER_COOKIE_NAME, hasSessionCookie, isValidUserId } from "./user-cookie";

/**
 * THE way to learn who is calling. Every route handler and service gets the caller's canonical user id from
 * here and from nowhere else (never from a body, query string, header or client-supplied id).
 *
 *   authenticated: a valid, unexpired server-side login session. userId = that account's `users.id`.
 *   anonymous:     no valid login session. userId = the browser's anonymous identity, from the anonymous cookie.
 *
 * The anonymous cookie is a low-trust bearer credential and is honoured ONLY for an active anonymous user:
 *   - an id that belongs to a registered account is never accepted through it (it would otherwise let anyone who
 *     learns an account id act as that account);
 *   - an id that was merged into an account (a tombstone) is not accepted either: possessing an old anonymous
 *     cookie must not grant access to the account that absorbed it. Such a browser simply gets a fresh anonymous
 *     identity.
 * When the caller is authenticated the anonymous cookie is ignored.
 */
export type CurrentUser =
  | { kind: "anonymous"; userId: string }
  | { kind: "authenticated"; userId: string; email: string };

export async function getCurrentUser(): Promise<CurrentUser> {
  const cookieStore = await cookies();

  // Cheap path: no login-session cookie, no need to consult the auth library at all.
  if (hasSessionCookie(cookieStore)) {
    const account = await readAuthenticatedUser();
    if (account) return account;
  }

  const db = getDb();
  const presented = cookieStore.get(USER_COOKIE_NAME)?.value;
  if (presented && isValidUserId(presented)) {
    const row = db.select({ kind: users.kind, mergedInto: users.mergedIntoUserId }).from(users).where(eq(users.id, presented)).get();
    if (!row) {
      db.insert(users).values({ id: presented }).onConflictDoNothing().run();
      return { kind: "anonymous", userId: presented };
    }
    if (row.kind === "anonymous" && !row.mergedInto) return { kind: "anonymous", userId: presented };
    // An account id, or a merged (tombstoned) anonymous id, presented through the anonymous cookie: not honoured.
    logger.warn("Anonymous cookie did not identify an active anonymous user; issuing a new anonymous identity");
  }

  const userId = newId();
  db.insert(users).values({ id: userId }).run();
  cookieStore.set(USER_COOKIE_NAME, userId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: USER_COOKIE_MAX_AGE_SECONDS,
  });
  return { kind: "anonymous", userId };
}

async function readAuthenticatedUser(): Promise<CurrentUser | null> {
  try {
    const session = await getAuth().api.getSession({ headers: await headers() });
    if (!session?.user?.id) return null;
    const row = getDb()
      .select({ kind: users.kind, email: users.email, mergedInto: users.mergedIntoUserId })
      .from(users)
      .where(eq(users.id, session.user.id))
      .get();
    // Defence in depth: only a live registered account can be authenticated.
    if (!row || row.kind !== "registered" || row.mergedInto || !row.email) return null;
    return { kind: "authenticated", userId: session.user.id, email: row.email };
  } catch (error) {
    // A broken or unverifiable session is "not logged in", never a 500 and never a different identity.
    logger.warn("Could not read the login session; treating the caller as anonymous", { error });
    return null;
  }
}

/** The caller's canonical user id (authenticated or anonymous). */
export async function getCurrentUserId(): Promise<string> {
  return (await getCurrentUser()).userId;
}

/** For account-only operations: the authenticated caller, or a 401. */
export async function requireAuthenticated(): Promise<Extract<CurrentUser, { kind: "authenticated" }>> {
  const user = await getCurrentUser();
  if (user.kind !== "authenticated") throw new HttpError(401, "not_authenticated", "Please sign in to do that.");
  return user;
}
