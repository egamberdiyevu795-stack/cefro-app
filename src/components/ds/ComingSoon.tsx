"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";
import { ICON_BUTTON } from "./styles";

/**
 * Elements behind a feature flag (src/config/features.ts) stay in the design and say "Coming soon" when tapped.
 * Any number of ComingSoonButtons share one ComingSoonToast, mounted once per page.
 */
const EVENT = "cefro:coming-soon";

export function announceComingSoon(feature: string) {
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: feature }));
}

/** A future control: looks like the real one (pass its classes), and shows "Coming soon" instead of acting. */
export function ComingSoonButton({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} className={className} onClick={() => announceComingSoon(label)}>
      {children}
    </button>
  );
}

/** The small "Coming soon" message. Polite live region, so screen readers hear it too. */
export function ComingSoonToast() {
  const [feature, setFeature] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAnnounce = (event: Event) => {
      setFeature((event as CustomEvent<string>).detail);
      clearTimeout(timer);
      timer = setTimeout(() => setFeature(null), 2200);
    };
    window.addEventListener(EVENT, onAnnounce);
    return () => {
      window.removeEventListener(EVENT, onAnnounce);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-20 flex justify-center px-4 lg:bottom-10">
      {feature && (
        <span className="rounded-full bg-primary px-4 py-2 text-label font-medium text-on-primary shadow-card">
          <span className="sr-only">{feature}: </span>
          Coming soon
        </span>
      )}
    </div>
  );
}

/** Row menu (⋮) whose items are all future actions: picking one says "Coming soon". Closes on Escape or outside click. */
export function ComingSoonMenu({ label, items }: { label: string; items: readonly string[] }) {
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
        className={cx(ICON_BUTTON, "size-7")}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="more" size={18} />
      </button>
      {open && (
        <ul role="menu" className="absolute right-0 top-full z-10 mt-1 min-w-44 rounded-tile border border-line bg-card p-1 shadow-card">
          {items.map((item) => (
            <li key={item} role="none">
              <button
                type="button"
                role="menuitem"
                className="w-full rounded-icon px-3 py-2 text-left text-label text-fg hover:bg-well focus-visible:bg-well focus-visible:outline-none"
                onClick={() => {
                  setOpen(false);
                  announceComingSoon(item);
                }}
              >
                {item}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
