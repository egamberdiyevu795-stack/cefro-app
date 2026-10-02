import "server-only";
import { cookies } from "next/headers";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { newId } from "@/server/ids";
import { USER_COOKIE_NAME, USER_COOKIE_MAX_AGE_SECONDS, isValidUserId } from "./user-cookie";

/**
 * Resolve the current user for an API request.
 *
 * There is no authentication yet: each browser gets a random anonymous id
 * in an httpOnly cookie (set by `src/proxy.ts` on page loads, or here as a
 * fallback). When real auth is added, replace this function — every caller
 * already depends only on the returned user id.
 */
export async function getOrCreateCurrentUserId(): Promise<string> {
  const cookieStore = await cookies();
  let userId = cookieStore.get(USER_COOKIE_NAME)?.value;
  if (!userId || !isValidUserId(userId)) {
    userId = newId();
    cookieStore.set(USER_COOKIE_NAME, userId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: USER_COOKIE_MAX_AGE_SECONDS,
    });
  }
  getDb().insert(users).values({ id: userId }).onConflictDoNothing().run();
  return userId;
}
