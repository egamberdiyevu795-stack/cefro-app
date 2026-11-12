"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The exam laptop (T7) has no link out at all: a student at the shared laptop must have nothing to follow (docs/teacher-plan.md, section 11). */
const EXAM_LAPTOP_PAGE = /^\/teacher\/classes\/[^/]+\/exam\/[^/]+\/laptop\/?$/;

/**
 * The quiet footer on every page: one small "Credits" link (the voice attribution CC BY 4.0 asks for). No button, nothing else.
 * It is left out of the exam laptop page only. It sits below the page's own full-height frame, so it never competes with a screen.
 */
export function SiteFooter() {
  const pathname = usePathname();
  if (EXAM_LAPTOP_PAGE.test(pathname)) return null;
  return (
    <footer className="bg-page px-4 pb-6 pt-2 text-center font-ui text-caption text-fg-muted">
      <Link href="/credits" className="underline underline-offset-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2">
        Credits
      </Link>
    </footer>
  );
}
