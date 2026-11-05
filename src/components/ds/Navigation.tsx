import Link from "next/link";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

export type NavItem = { href: string; label: string; icon: IconName };

/** One navigation icon. Active = near-black rounded square with a white glyph; inactive = grey glyph. */
export function SidebarItem({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      title={item.label}
      className={cx(
        "flex size-11 items-center justify-center rounded-icon transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        active ? "bg-primary text-on-primary" : "text-fg-subtle hover:text-fg",
      )}
    >
      <Icon name={item.icon} size={20} />
    </Link>
  );
}

/** Left icon rail on desktop; a fixed bottom bar on phones. Same items, same active square. */
export function Sidebar({ items, activeHref }: { items: readonly NavItem[]; activeHref: string }) {
  return (
    <nav
      aria-label="Main"
      className={cx(
        "fixed inset-x-0 bottom-0 z-10 border-t border-line bg-card px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2",
        "lg:static lg:border-0 lg:bg-transparent lg:p-0",
      )}
    >
      <ul className="flex items-center justify-between lg:flex-col lg:justify-start lg:gap-3">
        {items.map((item) => (
          <li key={item.label}>
            <SidebarItem item={item} active={item.href === activeHref} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Top bar: search on the left, quiet text actions and a bell on the right. */
export function TopBar({ searchPlaceholder, actions }: { searchPlaceholder: string; actions: React.ReactNode }) {
  return (
    <div className="flex h-12 items-center gap-4">
      <label className="flex min-w-0 flex-1 items-center gap-2 text-fg-muted">
        <Icon name="search" size={16} className="shrink-0" />
        <span className="sr-only">Search</span>
        <input
          type="search"
          placeholder={searchPlaceholder}
          className="w-full min-w-0 bg-transparent text-body text-fg outline-none placeholder:text-fg-muted"
        />
      </label>
      <div className="flex items-center gap-4">{actions}</div>
    </div>
  );
}

/** A quiet text action with a small grey glyph, for the top bar. */
export function TopBarLink({ href, icon, children }: { href: string; icon: IconName; children: React.ReactNode }) {
  return (
    <Link href={href} className="hidden items-center gap-2 text-body font-medium text-fg hover:text-fg-muted sm:inline-flex">
      <Icon name={icon} size={16} className="text-fg-subtle" />
      {children}
    </Link>
  );
}
