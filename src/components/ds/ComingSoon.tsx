"use client";

import { useEffect, useState } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";
import { Menu } from "./Menu";
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

/** Row menu (⋮) whose items are all future actions: picking one says "Coming soon". */
export function ComingSoonMenu({ label, items }: { label: string; items: readonly string[] }) {
  return (
    <Menu
      label={label}
      trigger={<Icon name="more" size={18} />}
      triggerClassName={cx(ICON_BUTTON, "size-7")}
      items={items.map((item) => ({ label: item, onSelect: () => announceComingSoon(item) }))}
    />
  );
}
