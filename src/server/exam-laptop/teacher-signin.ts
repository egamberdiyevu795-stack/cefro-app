import "server-only";
import { eq } from "drizzle-orm";
import { headers as requestHeaders } from "next/headers";
import { POST as authPost } from "@/app/api/auth/[...all]/route";
import { EXAM_MESSAGES } from "@/domain/teacher/exam-laptop";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { HttpError } from "@/server/errors";

/*
 * Moving a browser in and out of exam laptop mode goes through the app's own sign-in and sign-out endpoint, so every limit
 * (wrong passwords per email and per address, 429) and every cookie rule applies exactly as on the sign-in page. What comes back
 * is `Set-Cookie` lines for the caller to put on its own response.
 */

const originOf = (request: Request) => new URL(request.url).origin;

async function viaAuth(request: Request, path: "/sign-in/email" | "/sign-out", body: unknown, withCookies: boolean): Promise<Response> {
  const headers = new Headers({ "content-type": "application/json", origin: originOf(request) });
  for (const name of ["x-forwarded-for", "x-real-ip"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const cookie = (await requestHeaders()).get("cookie");
  if (withCookies && cookie) headers.set("cookie", cookie);
  return authPost(new Request(`${originOf(request)}/api/auth${path}`, { method: "POST", headers, body: JSON.stringify(body) }));
}

/** The teacher's login session on this browser ends (the row is deleted, the cookie removed): the lines to send back. */
export async function signOutBrowser(request: Request): Promise<string[]> {
  return (await viaAuth(request, "/sign-out", {}, true)).headers.getSetCookie();
}

/**
 * The device's teacher types their email and password: a normal teacher session comes back (the lines to send). Their email must be
 * the teacher's own (another account's password does not turn the laptop into that account's session).
 */
export async function signInDeviceTeacher(request: Request, teacherId: string, email: unknown, password: unknown): Promise<string[]> {
  if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password) throw new HttpError(400, "credentials_required", EXAM_MESSAGES.needsCredentials);
  const row = await (await getDb()).select({ email: users.email }).from(users).where(eq(users.id, teacherId)).get();
  if (!row?.email || row.email.toLowerCase() !== email.trim().toLowerCase()) throw new HttpError(400, "wrong_credentials", EXAM_MESSAGES.wrongCredentials);
  const response = await viaAuth(request, "/sign-in/email", { email: row.email, password }, false);
  if (response.status === 429) {
    const retry = Number(response.headers.get("retry-after")) || undefined;
    throw new HttpError(429, "login_rate_limited", "Too many wrong passwords. Please wait a few minutes and try again.", retry);
  }
  if (!response.ok) throw new HttpError(400, "wrong_credentials", EXAM_MESSAGES.wrongCredentials);
  return response.headers.getSetCookie();
}
