import { Sidebar } from "@/components/ds";
import type { FeatureFlags } from "@/config/features";
import { AccountTab } from "@/features/dashboard/AccountTab";
import { navItemsFor } from "@/features/dashboard/mock-data";
import { Wordmark } from "@/features/dashboard/sections";
import { BackLink } from "@/features/result/sections";
import { asDemoTeacher } from "@/features/teacher/links";

/**
 * The design-system frame for a task page (result, practice): grey page, rounded shell from 768 px, icon rail /
 * phone bottom bar, and a header with the back link. `account`: "real" asks the server who is signed in (every real
 * page); "mock" shows the demo account (mock mode and the design prototypes), and then every link keeps ?mock=1.
 */
export function AppShell({
  flags,
  account,
  activeHref = "/practice",
  mock = account === "mock",
  demoTeacher = false,
  back,
  children,
}: {
  flags: FeatureFlags;
  account: "real" | "mock";
  /** Mock mode (`?mock=1`): every link of the frame keeps it. Defaults to the mocked account. */
  mock?: boolean;
  /** The nav item shown as the current page. */
  activeHref?: string;
  /** Mock mode's demo teacher: Home and Account open the demo teacher's pages (`?mock=1&as=teacher`). */
  demoTeacher?: boolean;
  /**
   * The header's back link, when it is not the dashboard (e.g. a teacher's class). `false`: no back link, for the main
   * tabs (the side menu already goes everywhere) and for pages that have their own, more precise back link (a lesson).
   */
  back?: { href: string; label: string } | false;
  children: React.ReactNode;
}) {
  const items = navItemsFor(flags, mock).map((item) => (demoTeacher && item.href.startsWith("/dashboard") ? { ...item, href: asDemoTeacher("/dashboard") } : item));
  return (
    <div className="min-h-dvh bg-page font-ui text-fg md:p-6">
      <div className="mx-auto flex max-w-[1280px] px-4 pt-2 md:min-h-[calc(100dvh-3rem)] md:gap-6 md:rounded-shell md:bg-shell md:p-6 md:pt-6 md:shadow-card">
        <aside className="md:flex md:w-12 md:shrink-0 md:flex-col md:items-center md:gap-14">
          <Wordmark className="hidden md:flex md:h-12" mock={mock} href={demoTeacher ? asDemoTeacher("/dashboard") : undefined} />
          <Sidebar
            items={items}
            activeHref={activeHref}
            last={<AccountTab source={account} active={activeHref === "/profile"} href={demoTeacher ? asDemoTeacher("/profile") : undefined} />}
          />
        </aside>

        <div className="min-w-0 flex-1">
          <header className="mb-2 flex h-12 items-center justify-between md:mb-3">
            {back === false ? (
              <span aria-hidden="true" />
            ) : (
              <BackLink mock={mock} href={back?.href ?? (demoTeacher ? asDemoTeacher("/dashboard") : undefined)} label={back?.label} />
            )}
            <Wordmark className="flex md:hidden" mock={mock} href={demoTeacher ? asDemoTeacher("/dashboard") : undefined} />
          </header>
          <main id="main" className="pb-28 md:pb-0">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
