import Link from "next/link";
import { ComingSoonButton } from "./ComingSoon";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";
import { NAV_ITEM, NAV_ITEM_ACTIVE, NAV_ITEM_IDLE, TEXT_ACTION } from "./styles";

/** `soon`: a future item (feature flag on): same look, tapping it says "Coming soon". */
export type NavItem = { href: string; label: string; icon: IconName; soon?: boolean };

/** One navigation icon. Active = near-black rounded square with a white glyph; inactive = grey glyph. */
export function SidebarItem({ item, active }: { item: NavItem; active: boolean }) {
  if (item.soon) {
    return (
      <ComingSoonButton label={item.label} className={cx(NAV_ITEM, NAV_ITEM_IDLE)}>
        <Icon name={item.icon} size={20} />
      </ComingSoonButton>
    );
  }
  return (
    <Link
      href={item.href}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      title={item.label}
      className={cx(NAV_ITEM, active ? NAV_ITEM_ACTIVE : NAV_ITEM_IDLE)}
    >
      <Icon name={item.icon} size={20} />
    </Link>
  );
}

/** Left icon rail on desktop; a fixed bottom bar on phones. Same items, same active square. `last` = an extra item at the end (account). */
export function Sidebar({ items, activeHref, last }: { items: readonly NavItem[]; activeHref: string; last?: React.ReactNode }) {
  return (
    <nav
      aria-label="Main"
      className={cx(
        "fixed inset-x-0 bottom-0 z-10 border-t border-line bg-card px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2",
        "lg:static lg:border-0 lg:bg-transparent lg:p-0",
      )}
    >
      <ul className="flex items-center justify-around lg:flex-col lg:justify-start lg:gap-3">
        {items.map((item) => (
          <li key={item.label}>
            <SidebarItem item={item} active={item.href === activeHref} />
          </li>
        ))}
        {last && <li>{last}</li>}
      </ul>
    </nav>
  );
}

/** Top bar: optional search on the left, quiet text actions on the right. */
export function TopBar({ search, actions }: { search?: React.ReactNode; actions: React.ReactNode }) {
  return (
    <div className="flex h-12 items-center gap-4">
      <div className="min-w-0 flex-1">{search}</div>
      <div className="flex items-center gap-4">{actions}</div>
    </div>
  );
}

/** Search entry point that is not built yet: looks like the search field, says "Coming soon" when tapped. */
export function SearchSoon({ placeholder }: { placeholder: string }) {
  return (
    <ComingSoonButton label="Search" className="flex w-full min-w-0 items-center gap-2 text-left text-body text-fg-muted hover:text-fg">
      <Icon name="search" size={16} className="shrink-0" />
      <span className="truncate">{placeholder}</span>
    </ComingSoonButton>
  );
}

/** A quiet text action with a small grey glyph, for the top bar. `soon` makes it a "Coming soon" button. */
export function TopBarLink({ href, icon, soon, children }: { href: string; icon: IconName; soon?: boolean; children: string }) {
  const inner = (
    <>
      <Icon name={icon} size={16} className="text-fg-subtle" />
      {children}
    </>
  );
  const className = cx("hidden sm:inline-flex", TEXT_ACTION);
  return soon ? (
    <ComingSoonButton label={children} className={className}>
      {inner}
    </ComingSoonButton>
  ) : (
    <Link href={href} className={className}>
      {inner}
    </Link>
  );
}
