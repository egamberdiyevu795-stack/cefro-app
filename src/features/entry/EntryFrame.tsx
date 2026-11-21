import Link from "next/link";
import { WordmarkLink, cx, styles } from "@/components/ds";
import { mockLink } from "@/features/demo/demo-mode";

/**
 * The frame of the signed-out pages (home, sign in, Create account, password reset): the grey page, the CEFRO wordmark
 * on top (and, on home, a small grey "Sign in" on the right: `headerEnd`). No header menu and no navigation tabs:
 * nothing there works signed out. Built only from design-system tokens and components, so a theme change restyles it.
 *
 * Phones: one column with 16 px gutters, the header in the same column. From 768 px the header spans the page (wordmark
 * left, "Sign in" right, like any desktop site) and the content gets room to breathe:
 * - `width="narrow"` (forms: sign in, Create account, password reset): one centred column of at most 448 px, lower down
 *   the page. A form is easier to fill in narrow, on every screen.
 * - `width="wide"` (home): a centred column of at most 1024 px; the page lays itself out in two columns from 1024 px.
 */
export function EntryFrame({
  mock = false,
  headerEnd,
  width = "narrow",
  children,
}: {
  mock?: boolean;
  headerEnd?: React.ReactNode;
  width?: "narrow" | "wide";
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-page font-ui text-fg">
      <header className="mx-auto flex w-full max-w-md items-center justify-between gap-4 px-4 pt-4 sm:pt-10 md:max-w-[1120px] md:px-8 md:pt-6">
        <WordmarkLink href={mockLink("/", mock)} className="flex h-11 w-fit" />
        {headerEnd}
      </header>
      <main
        id="main"
        className={cx(
          "mx-auto flex w-full flex-col gap-6 px-4 pt-6 pb-12",
          width === "narrow" ? "max-w-md md:pt-16" : "max-w-md md:max-w-5xl md:px-8 md:pt-12 lg:pt-20",
        )}
      >
        {children}
      </main>
    </div>
  );
}

/** The page's one heading: large, medium weight, never bold. */
export function EntryHeading({ className, children }: { className?: string; children: React.ReactNode }) {
  return <h1 className={cx("text-heading font-medium tracking-[-0.02em] text-fg", className)}>{children}</h1>;
}

/** "Have an account? Sign in": muted words, then the link (dark and underlined, so it never relies on colour alone). */
export function EntrySwitch({ text, href, link }: { text: string; href: string; link: string }) {
  return (
    <p className="flex flex-wrap items-center gap-x-1 text-body text-fg-muted">
      {text}
      <Link href={href} className={cx("inline-flex min-h-11 items-center font-medium text-fg underline underline-offset-4", styles.FOCUS_RING)}>
        {link}
      </Link>
    </p>
  );
}

/** The home page's small grey "Sign in" in the top row: muted (5.26:1 on the page), underlined, 44 px tap height. */
export function EntryHeaderLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={cx("inline-flex min-h-11 items-center px-1 text-body text-fg-muted underline underline-offset-4", styles.FOCUS_RING)}>
      {children}
    </Link>
  );
}
