"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * A thin bar at the top of the screen that starts the moment a link to another page of this site is tapped and ends when
 * that page has arrived. The pages are built on the server, so a tap can take a moment; this tells the person at once that
 * the tap worked. It changes nothing about how pages load (they are still complete HTML, with the right status codes, and
 * work before the scripts do): without scripts it simply never appears.
 */
export function NavProgress() {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);

  // The new page arrived.
  useEffect(() => {
    const timer = window.setTimeout(() => setPending(false), 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      // Another site, or the same page (a filter changes only the query): nothing to wait for.
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      setPending(true);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // Never leave the bar up for good (a link that opened a download, say).
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setPending(false), 15_000);
    return () => window.clearTimeout(timer);
  }, [pending]);

  if (!pending) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5">
      <div className="nav-progress-bar h-full bg-primary" />
    </div>
  );
}
