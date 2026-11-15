import { Sidebar } from "@/components/ds";
import type { FeatureFlags } from "@/config/features";
import { AccountTab } from "@/features/dashboard/AccountTab";
import { navItemsFor } from "@/features/dashboard/mock-data";
import { Wordmark } from "@/features/dashboard/sections";
import { BackLink } from "@/features/result/sections";
import { asDemoTeacher } from "@/features/teacher/links";

/**
 * The design-system frame for a task page (result, practice): grey page, rounded shell on desktop, icon rail /
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
  /** The header's back link, when it is not the dashboard (e.g. a teacher's class). */
  back?: { href: string; label: string };
  children: React.ReactNode;
}) {
  const items = navItemsFor(flags, mock).map((item) => (demoTeacher && item.href.startsWith("/dashboard") ? { ...item, href: asDemoTeacher("/dashboard") } : item));
  return (
    <div className="min-h-dvh bg-page font-ui text-fg lg:p-6">
      <div className="mx-auto flex max-w-[1280px] px-4 pt-2 lg:gap-6 lg:rounded-shell lg:bg-shell lg:p-6 lg:pt-6 lg:shadow-card">
        <aside className="lg:flex lg:w-12 lg:shrink-0 lg:flex-col lg:items-center lg:gap-14">
          <Wordmark className="hidden lg:flex lg:h-12" mock={mock} href={demoTeacher ? asDemoTeacher("/dashboard") : undefined} />
          <Sidebar
            items={items}
            activeHref={activeHref}
            last={<AccountTab source={account} active={activeHref === "/profile"} href={demoTeacher ? asDemoTeacher("/profile") : undefined} />}
          />
        </aside>

        <div className="min-w-0 flex-1">
          <header className="mb-2 flex h-12 items-center justify-between lg:mb-3">
            <BackLink mock={mock} href={back?.href ?? (demoTeacher ? asDemoTeacher("/dashboard") : undefined)} label={back?.label} />
            <Wordmark className="flex lg:hidden" mock={mock} href={demoTeacher ? asDemoTeacher("/dashboard") : undefined} />
          </header>
          <main id="main" className="pb-28 lg:pb-0">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
