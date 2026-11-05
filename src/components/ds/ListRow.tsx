import { cx } from "./cx";
import { IconButton } from "./PillButton";

/**
 * One row of a list card: round thumbnail, bold name, then cells, then a row menu.
 * `columns` is the grid template for the cells between the name and the menu, so every row in a list lines up.
 * A cell with `phone: false` is hidden below the `sm` breakpoint.
 */
export function ListRow({
  thumb,
  title,
  subtitle,
  cells,
  columns,
  titleClassName,
  menuLabel,
}: {
  thumb: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
  cells: Array<{ content: React.ReactNode; className?: string; phone?: boolean }>;
  columns: string;
  titleClassName?: string;
  menuLabel: string;
}) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      {thumb}
      <div className={cx("grid min-w-0 flex-1 items-center gap-x-4 gap-y-1", columns)}>
        <span className={cx("min-w-0", titleClassName)}>
          <span className="block text-body font-semibold text-fg sm:truncate">{title}</span>
          {subtitle && <span className="block text-caption text-fg-muted">{subtitle}</span>}
        </span>
        {cells.map((cell, i) => (
          <span key={i} className={cx(cell.phone === false ? "hidden sm:flex" : "flex", "min-w-0 items-center text-label text-fg", cell.className)}>
            {cell.content}
          </span>
        ))}
      </div>
      <IconButton icon="more" label={menuLabel} size={28} />
    </li>
  );
}

/** Neutral round placeholder for photos and avatars. */
export function Thumb({ tone = 1, size = 32, children }: { tone?: 1 | 2 | 3 | 4; size?: number; children?: React.ReactNode }) {
  const bg = { 1: "bg-block-1", 2: "bg-block-2", 3: "bg-block-3", 4: "bg-block-4" }[tone];
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full text-on-primary", bg)}
    >
      {children}
    </span>
  );
}
