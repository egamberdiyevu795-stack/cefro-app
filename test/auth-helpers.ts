import { POST as authPost, GET as authGet } from "@/app/api/auth/[...all]/route";
import { applySetCookies, jar } from "./next-headers-mock";

/** Calls the real auth route handlers (limits, token stripping and all) the way a browser would. */
export function authRequest(path: string, body: unknown, options: { ip?: string; cookie?: string; method?: "POST" | "GET" } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", origin: "http://localhost" };
  if (options.ip) headers["x-forwarded-for"] = options.ip;
  const cookie = options.cookie ?? [...jar.entries()].map(([n, v]) => `${n}=${v}`).join("; ");
  if (cookie) headers.cookie = cookie;
  const request = new Request(`http://localhost/api/auth${path}`, {
    method: options.method ?? "POST",
    headers,
    body: options.method === "GET" ? undefined : JSON.stringify(body),
  });
  return options.method === "GET" ? authGet() : authPost(request);
}

export const PASSWORD = "correct horse battery staple";

/** Sign up as the form does. `name`: what was typed in Name (default: nothing, so the account has no name). */
export async function signUp(email: string, password = PASSWORD, options: { ip?: string; cookie?: string; name?: string } = {}) {
  const response = await authRequest("/sign-up/email", { email, password, name: options.name ?? "" }, options);
  applySetCookies(response);
  return response;
}

export async function signIn(email: string, password = PASSWORD, options: { ip?: string; cookie?: string } = {}) {
  const response = await authRequest("/sign-in/email", { email, password }, options);
  applySetCookies(response);
  return response;
}

export async function signOut() {
  const response = await authRequest("/sign-out", {});
  applySetCookies(response);
  return response;
}
