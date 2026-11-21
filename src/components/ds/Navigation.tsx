import Link from "next/link";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";
import { NAV_ITEM, NAV_ITEM_ACTIVE, NAV_ITEM_IDLE, TEXT_ACTION } from "./styles";

export type NavItem = { href: string; label: string; icon: IconName };

/**
 * One navigation icon, always a real link. Active = grey rounded square with a dark glyph (never black: the page's own
 * black button is the only black control on screen); inactive = grey glyph.
 */
export function SidebarItem({ item, active }: { item: NavItem; active: boolean }) {
  const activeClass = NAV_ITEM_ACTIVE;
  return (
    <Link
      href={item.href}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      title={item.label}
      className={cx(NAV_ITEM, active ? activeClass : NAV_ITEM_IDLE)}
    >
      <Icon name={item.icon} size={20} />
    </Link>
  );
}

/** Left icon rail from 768 px (laptops, also at 150% zoom, and tablets); a fixed bottom bar on phones. Same items, same grey active square. `last` = an extra item at the end (account). */
export function Sidebar({
  items,
  activeHref,
  last,
}: {
  items: readonly NavItem[];
  activeHref: string;
  last?: React.ReactNode;
}) {
  return (
    <nav
      aria-label="Main"
      className={cx(
        "fixed inset-x-0 bottom-0 z-10 border-t border-line bg-card px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2",
        "md:static md:border-0 md:bg-transparent md:p-0",
      )}
    >
      <ul className="flex items-center justify-around md:flex-col md:justify-start md:gap-3">
        {items.map((item) => (
          <li key={item.label}>
            {/* The path decides (mock mode adds ?mock=1 to every link). */}
            <SidebarItem item={item} active={item.href.split(/[?#]/)[0] === activeHref} />
          </li>
        ))}
        {last && <li>{last}</li>}
      </ul>
    </nav>
  );
}

/** Top bar: quiet text actions on the right. */
export function TopBar({ actions }: { actions: React.ReactNode }) {
  return <div className="flex h-12 items-center justify-end gap-4">{actions}</div>;
}

/** A quiet text action with a small grey glyph, for the top bar. */
export function TopBarLink({ href, icon, children }: { href: string; icon: IconName; children: string }) {
  return (
    <Link href={href} className={cx("hidden sm:inline-flex", TEXT_ACTION)}>
      <Icon name={icon} size={16} className="text-fg-subtle" />
      {children}
    </Link>
  );
}
