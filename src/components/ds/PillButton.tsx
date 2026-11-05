import Link from "next/link";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

type Variant = "primary" | "quiet" | "light";
type Size = "md" | "sm";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary/85",
  quiet: "bg-well text-fg hover:bg-line",
  // For pills that sit on a `well` surface (e.g. exam-part tiles), where `quiet` would disappear.
  light: "bg-card text-fg hover:bg-line",
};

const SIZES: Record<Size, string> = {
  md: "h-9 gap-2 px-5 text-body",
  sm: "h-7 gap-1.5 px-3 text-label",
};

/** Pill-shaped link. Primary = near-black; quiet = grey well (like "View detailed report"); light = card-white on a well. */
export function PillButton({
  href,
  variant = "primary",
  size = "md",
  icon,
  label,
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  /** Accessible name, when the visible text alone is ambiguous (e.g. several "Practise" pills). */
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={cx(
        "inline-flex items-center justify-center rounded-full font-medium transition-colors",
        SIZES[size],
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        VARIANTS[variant],
        className,
      )}
    >
      {icon && <Icon name={icon} size={size === "sm" ? 14 : 16} />}
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
