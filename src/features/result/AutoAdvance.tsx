"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Mock mode only: after `delayMs`, replace the page with `href` (the mock "Scoring…" opening its result). */
export function AutoAdvance({ href, delayMs = 4000 }: { href: string; delayMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setTimeout(() => router.replace(href), delayMs);
    return () => clearTimeout(timer);
  }, [router, href, delayMs]);
  return null;
}
