import { cx } from "./cx";
import { Icon } from "./Icon";

export type Status = "passed" | "pending" | "failed";

const STATUS_TEXT: Record<Status, string> = { passed: "Passed", pending: "Pending", failed: "Failed" };

/** Status as grey glyph + dark text. Meaning is carried by the word and glyph shape, never by colour. */
export function StatusLabel({ status, className }: { status: Status; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-label text-fg", className)}>
      <Icon name={status} size={14} className="text-fg-subtle" />
      {STATUS_TEXT[status]}
    </span>
  );
}

/** Small lime pill for a positive change ("+1 band"). Only for improvements. */
export function DeltaLabel({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <span aria-label={label} className="inline-flex h-6 items-center rounded-full bg-lime px-2.5 text-caption font-medium text-on-lime">
      {children}
    </span>
  );
}
