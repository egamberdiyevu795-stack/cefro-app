import Link from "next/link";
import { Icon, Sidebar, cx, styles } from "@/components/ds";
import { FEATURE_FLAGS } from "@/config/features";
import { navItemsFor } from "@/features/dashboard/mock-data";
import { Wordmark } from "@/features/dashboard/sections";

/**
 * What a tap shows at once, while the server builds the real page (the `loading.tsx` of each main section): the same
 * frame as AppShell, with the navigation, and grey placeholder cards where the content will be. Nothing here reads the
 * account or the database, and it makes no request, so it appears immediately. The real page replaces it as soon as it
 * is ready. The Account icon is a plain link: the real frame asks the server who is signed in, and this one must not.
 */
export function LoadingFrame({ activeHref }: { activeHref: string }) {
  const items = navItemsFor(FEATURE_FLAGS, false);
  return (
    <div className="min-h-dvh bg-page font-ui text-fg md:p-6">
      <div className="mx-auto flex max-w-[1280px] px-4 pt-2 md:min-h-[calc(100dvh-3rem)] md:gap-6 md:rounded-shell md:bg-shell md:p-6 md:pt-6 md:shadow-card">
        <aside className="md:flex md:w-12 md:shrink-0 md:flex-col md:items-center md:gap-14">
          <Wordmark className="hidden md:flex md:h-12" mock={false} />
          <Sidebar
            items={items}
            activeHref={activeHref}
            last={
              <Link
                href="/profile"
                aria-label="Account"
                title="Account"
                className={cx(styles.NAV_ITEM, activeHref === "/profile" ? styles.NAV_ITEM_ACTIVE : styles.NAV_ITEM_IDLE)}
              >
                <Icon name="user" size={20} />
              </Link>
            }
          />
        </aside>

        <div className="min-w-0 flex-1">
          <header className="mb-2 flex h-12 items-center justify-between md:mb-3">
            <span aria-hidden="true" />
            <Wordmark className="flex md:hidden" mock={false} />
          </header>
          <main id="main" className="pb-28 md:pb-0" aria-busy="true">
            <p role="status" className="sr-only">
              Loading
            </p>
            <div aria-hidden="true" className="space-y-4 motion-safe:animate-pulse">
              <div className="h-8 w-40 rounded-full bg-well" />
              <div className="h-40 rounded-card bg-card shadow-card" />
              <div className="h-28 rounded-card bg-card shadow-card" />
              <div className="h-28 rounded-card bg-card shadow-card" />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
