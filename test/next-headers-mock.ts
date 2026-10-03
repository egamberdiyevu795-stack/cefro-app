/**
 * A stand-in for `next/headers` that reads the "browser's" cookies from `jar`, so server code that asks who the
 * caller is can be tested without a running Next.js server. Use with:
 *
 *   vi.mock("next/headers", async () => (await import("../../test/next-headers-mock")).nextHeadersMock);
 */
export const jar = new Map<string, string>();

const serialise = () => [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");

export const nextHeadersMock = {
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string, options?: { maxAge?: number }) => {
      if (options?.maxAge === 0 || value === "") jar.delete(name);
      else jar.set(name, value);
    },
  }),
  headers: async () => new Headers({ cookie: serialise() }),
};

/** Apply a response's Set-Cookie headers to the jar, the way a browser would (clears honour Max-Age=0). */
export function applySetCookies(response: Response) {
  for (const line of response.headers.getSetCookie()) {
    const [pair, ...attributes] = line.split(";").map((part) => part.trim());
    const eq = pair.indexOf("=");
    const name = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    const cleared = attributes.some((a) => /^max-age=0$/i.test(a)) || value === "";
    if (cleared) jar.delete(name);
    else jar.set(name, value);
  }
}

export const SESSION_COOKIE = "cefro.session_token";
