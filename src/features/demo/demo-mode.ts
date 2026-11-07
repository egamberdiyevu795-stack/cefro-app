/**
 * Mock mode (`?mock=1`): the app with demo data, clickable on a Vercel Preview with no environment variables and no
 * database. Pure and browser-safe.
 *
 * The rule: once in mock mode, every link inside the app keeps `?mock=1`, so a tester never lands on a real page by
 * accident (task list → brief → practice → result → retry → dashboard → History, and the navigation between them).
 */

export const MOCK_PARAM = "mock";

/** The header `src/proxy.ts` sets for a request in mock mode, so a layout (which gets no query) can tell. */
export const MOCK_HEADER = "x-cefro-mock";

type Query = Record<string, string | string[] | undefined>;

/** Is this request in mock mode? Only exactly `?mock=1` (the first value when repeated). */
export function isMockQuery(query: Query): boolean {
  const value = query[MOCK_PARAM];
  return (Array.isArray(value) ? value[0] : value) === "1";
}

/** Any origin works: only the path, query and hash of the result are used. */
const BASE = "http://mock.invalid";

/**
 * The same internal link with `mock=1` added (kept where it is already set). Hash links keep their hash
 * (`/#part-2` → `/?mock=1#part-2`). External and protocol-relative links are returned unchanged.
 */
export function withMock(href: string): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const url = new URL(href, BASE);
  url.searchParams.set(MOCK_PARAM, "1");
  return `${url.pathname}${url.search}${url.hash}`;
}

/** `withMock` when `mock` is on, else the link unchanged. */
export function mockLink(href: string, mock: boolean): string {
  return mock ? withMock(href) : href;
}

/** Parses an internal link (for the demo data's own rewriting). */
export function parseInternal(href: string): URL {
  return new URL(href, BASE);
}

export function formatInternal(url: URL): string {
  return `${url.pathname}${url.search}${url.hash}`;
}
