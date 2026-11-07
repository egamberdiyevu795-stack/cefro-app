"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "./cx";

export type MenuItem = { label: string; onSelect: () => void };

/**
 * A button that opens a small card menu (row menu, account menu). Closes on Escape, outside tap or after a choice.
 * `panelClassName` places the panel (default: below, right-aligned). `header` is optional non-interactive text on top.
 */
export function Menu({
  label,
  trigger,
  triggerClassName,
  panelClassName = "right-0 top-full mt-1",
  header,
  items,
  current = false,
}: {
  label: string;
  trigger: React.ReactNode;
  triggerClassName?: string;
  panelClassName?: string;
  header?: React.ReactNode;
  items: readonly MenuItem[];
  /** The trigger stands for the current page (the Account item on Profile): `aria-current="page"`. */
  current?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-current={current ? "page" : undefined}
        className={triggerClassName}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
      </button>
      {open && (
        <div className={cx("absolute z-30 min-w-48 rounded-tile border border-line bg-card p-1 shadow-card", panelClassName)}>
          {header && <div className="border-b border-line px-3 pb-2 pt-1.5">{header}</div>}
          <ul role="menu" aria-label={label}>
            {items.map((item) => (
              <li key={item.label} role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="w-full rounded-icon px-3 py-2 text-left text-label text-fg hover:bg-well focus-visible:bg-well focus-visible:outline-none"
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
