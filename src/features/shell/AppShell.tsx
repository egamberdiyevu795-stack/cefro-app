import { ComingSoonToast, Sidebar } from "@/components/ds";
import type { FeatureFlags } from "@/config/features";
import { AccountMenu } from "@/features/dashboard/AccountMenu";
import { navItemsFor } from "@/features/dashboard/mock-data";
import { Wordmark } from "@/features/dashboard/sections";
import { BackLink } from "@/features/result/sections";

/**
 * The design-system frame for a task page (result, practice): grey page, rounded shell on desktop, icon rail /
 * phone bottom bar, and a header with the back link. `account: false` leaves out the mocked Account menu (pages that
 * show a real student must not show the mock name).
 */
export function AppShell({
  flags,
  account = true,
  headerEnd,
  children,
}: {
  flags: FeatureFlags;
  account?: boolean;
  /** Extra header content before the phone wordmark (the practice page's real sign-in state). */
  headerEnd?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-page font-ui text-fg lg:p-6">
      <div className="mx-auto flex max-w-[1280px] px-4 pt-2 lg:gap-6 lg:rounded-shell lg:bg-shell lg:p-6 lg:pt-6 lg:shadow-card">
        <aside className="lg:flex lg:w-12 lg:shrink-0 lg:flex-col lg:items-center lg:gap-14">
          <Wordmark className="hidden lg:flex lg:h-12" />
          <Sidebar items={navItemsFor(flags)} activeHref="/" last={account ? <AccountMenu /> : undefined} />
        </aside>

        <div className="min-w-0 flex-1">
          <header className="mb-2 flex h-12 items-center justify-between lg:mb-3">
            <BackLink />
            <div className="flex min-w-0 items-center gap-4">
              {headerEnd}
              <Wordmark className="flex lg:hidden" />
            </div>
          </header>
          <main id="main" className="pb-28 lg:pb-0">
            {children}
          </main>
        </div>
      </div>
      <ComingSoonToast />
    </div>
  );
}
