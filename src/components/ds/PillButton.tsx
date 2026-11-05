import Link from "next/link";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

type Variant = "primary" | "quiet";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary/85",
  quiet: "bg-well text-fg hover:bg-line",
};

/** Pill-shaped button or link. Primary = near-black; quiet = grey well (like "View detailed report"). */
export function PillButton({
  href,
  variant = "primary",
  icon,
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  icon?: IconName;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex h-9 items-center justify-center gap-2 rounded-full px-5 text-body font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        VARIANTS[variant],
        className,
      )}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </Link>
  );
}

/** Round icon-only button (top bar bell, row menus). `label` is its accessible name. */
export function IconButton({ icon, label, size = 32, className }: { icon: IconName; label: string; size?: number; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      style={{ width: size, height: size }}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full text-fg-subtle transition-colors hover:bg-well hover:text-fg",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        className,
      )}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}
