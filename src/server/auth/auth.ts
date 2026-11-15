import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, like } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { getEnv } from "@/server/config/env";
import { getDb, type Db } from "@/server/db/client";
import { authAccounts, authSessions, authVerifications, users } from "@/server/db/schema";
import { INSECURE_DEV_AUTH_SECRET } from "./secret";
import { mergeAnonymousCookieIdentity } from "@/server/identity/convert-anonymous";
import { AUTH_COOKIE_PREFIX, USER_COOKIE_NAME } from "@/server/identity/user-cookie";
import { logger } from "@/server/logging/logger";
import { clearPasswordFailures } from "./auth-limits";
import { RESET_LINK_MINUTES, sendPasswordResetEmail } from "./password-reset";

/**
 * The authentication boundary. Credentials, password hashing (scrypt), session tokens, cookie signing, origin
 * checks and the sign-in/sign-up/sign-out endpoints come from the maintained `better-auth` library; nothing
 * cryptographic is implemented here. This file configures it and connects it to CEFRO's identity model:
 *
 *  - an account IS a `users` row (kind "registered"), so there is one canonical id, not two;
 *  - login sessions live in `auth_sessions` (server-side; logout deletes the row);
 *  - after a successful sign-up or sign-in, the anonymous identity held in the request's cookie is merged into the
 *    account (see identity/convert-anonymous.ts) and that cookie is cleared.
 *
 * Everything else in the app asks `identity/current-user.ts` who the caller is; no other module touches this one.
 */


const SESSION_DAYS = 7;

function createAuth(db: Db) {
  const env = getEnv();
  const production = env.NODE_ENV === "production";
  return betterAuth({
    appName: "CEFRO",
    secret: env.AUTH_SECRET ?? (production ? undefined : INSECURE_DEV_AUTH_SECRET),
    baseURL: env.APP_URL,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: { user: users, session: authSessions, account: authAccounts, verification: authVerifications },
    }),
    // Registered users are marked as such at creation (anonymous rows keep the column default).
    user: { additionalFields: { kind: { type: "string", defaultValue: "registered", input: false } } },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      // Addresses are NOT verified (documented limitation): a student must be able to start without an inbox.
      requireEmailVerification: false,
      autoSignIn: true,
      // "Forgot password" (server/auth/password-reset.ts, docs/password-reset.md). Reached only through
      // /api/account/forgot-password and /api/account/reset-password, never through /api/auth.
      sendResetPassword: async ({ user, url, token }) => sendPasswordResetEmail({ to: user.email, origin: new URL(url).origin, token }),
      resetPasswordTokenExpiresIn: RESET_LINK_MINUTES * 60,
      // A new password signs the account out everywhere (whoever knew the old one is out), and lifts its lock.
      revokeSessionsOnPasswordReset: true,
      // Other links still waiting in the inbox stop working too: one reset per request, nothing left to replay.
      onPasswordReset: async ({ user }) => {
        clearPasswordFailures(user.email);
        await db.delete(authVerifications).where(and(like(authVerifications.identifier, "reset-password:%"), eq(authVerifications.value, user.id)));
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * SESSION_DAYS,
      updateAge: 60 * 60 * 24,
      // No signed-cookie cache: every request checks the session row, so logout takes effect immediately.
      cookieCache: { enabled: false },
    },
    advanced: {
      cookiePrefix: AUTH_COOKIE_PREFIX,
      useSecureCookies: production,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
      database: { generateId: () => randomUUID() },
    },
    // Defence in depth next to the (tighter, failure-based) per-email/per-IP limits in api/auth/[...all]/route.ts.
    // The library's stricter built-in rules for these two paths (3 per 10 s) are replaced so they cannot be
    // confused with, or hide, our limits' stable error codes. Per address and per minute, and a classroom shares one
    // address: 30 students signing in at once, each with a typo or two, must fit (sign-up is held to 30 an hour by
    // our own limit anyway).
    rateLimit: {
      enabled: true,
      window: 60,
      max: 60,
      storage: "memory",
      customRules: { "/sign-in/email": { window: 60, max: 120 }, "/sign-up/email": { window: 60, max: 60 } },
    },
    // No name typed at sign-up = no name stored (null), never one made from the email (the route checks the rest).
    databaseHooks: {
      user: {
        create: {
          before: async (user) => ({ data: { ...user, name: (typeof user.name === "string" && user.name.trim()) || null } as typeof user }),
        },
      },
    },
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email" && ctx.path !== "/sign-in/email") return;
        const session = ctx.context.newSession;
        if (!session) return; // failed attempt: nothing to convert
        const anonymousId = ctx.getCookie(USER_COOKIE_NAME);
        if (!anonymousId) return;
        try {
          await mergeAnonymousCookieIdentity(db, { anonymousUserId: anonymousId, accountUserId: session.user.id });
          // The anonymous cookie must not outlive the conversion.
          ctx.setCookie(USER_COOKIE_NAME, "", { maxAge: 0, path: "/", httpOnly: true, sameSite: "lax" });
        } catch (error) {
          // Never fail a valid login over this. The anonymous cookie is kept, and signing in again retries the
          // merge (it is idempotent and transactional).
          logger.error("Anonymous history could not be attached to the account", { error });
        }
      }),
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

const cache = new WeakMap<Db, Auth>();

/** The auth instance for the current database connection (tests swap the connection, so this follows it). */
export async function getAuth(): Promise<Auth> {
  const db = await getDb();
  let auth = cache.get(db);
  if (!auth) {
    auth = createAuth(db);
    cache.set(db, auth);
  }
  return auth;
}
