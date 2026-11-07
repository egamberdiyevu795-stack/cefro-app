import Link from "next/link";
import { headers } from "next/headers";
import { connection } from "next/server";
import { AccountMenu } from "@/features/dashboard/AccountMenu";
import { MOCK_HEADER, mockLink } from "@/features/demo/demo-mode";
import { assertServerConfigured } from "@/server/config/boot-check";

/**
 * Shell for the existing pages (home, login, register, practice). The dashboard has its own shell.
 * These pages need the full server configuration: in production a misconfigured server fails them (500) here.
 * `connection()` makes the check run on every request, not once at build time (the build has no secrets, and a page
 * prerendered at build time would otherwise skip the check at runtime).
 *
 * Mock mode (`?mock=1`, which only the task list has): no check, the demo account, and the logo keeps ?mock=1. A layout
 * gets no query, so the proxy passes it on as a request header (src/proxy.ts).
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const mock = (await headers()).get(MOCK_HEADER) === "1";
  if (!mock) assertServerConfigured();
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-4 sm:px-6">
          <Link href={mockLink("/", mock)} className="text-lg font-bold tracking-tight">
            CEFR<span className="text-brand">O</span>
          </Link>
          <div className="ml-auto">
            <AccountMenu source={mock ? "mock" : "real"} placement="header" />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {children}
      </main>
    </>
  );
}
