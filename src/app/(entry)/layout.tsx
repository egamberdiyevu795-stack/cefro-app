import { headers } from "next/headers";
import { connection } from "next/server";
import { MOCK_HEADER } from "@/features/demo/demo-mode";
import { assertServerConfigured } from "@/server/config/boot-check";

/**
 * The signed-out pages: home (`/`), sign in (`/login`), Create account (`/register`). No header menu, no navigation tabs:
 * each page draws its own frame (`EntryFrame`). Like every real app page, these pages need the full server configuration:
 * in production a misconfigured server fails them (500) here, on every request (`connection()`), never at build time.
 *
 * Mock mode (`?mock=1`, passed on by src/proxy.ts as a header, since a layout gets no query): no check. The pages then
 * read no cookie, identity or database and send nothing, so they work on a Vercel Preview with no variables.
 */
export default async function EntryLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const mock = (await headers()).get(MOCK_HEADER) === "1";
  if (!mock) assertServerConfigured();
  return (
    <>
      <a
        href="#main"
        className="sr-only font-ui text-body text-fg focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded-full focus:bg-card focus:px-4 focus:py-2 focus:shadow-card"
      >
        Skip to content
      </a>
      {children}
    </>
  );
}
