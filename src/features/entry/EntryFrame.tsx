import Link from "next/link";
import { WordmarkLink, cx, styles } from "@/components/ds";
import { mockLink } from "@/features/demo/demo-mode";

/**
 * The frame of the signed-out pages (home, sign in, Create account): the grey page, one narrow column with 16 px side
 * gutters on phones, the CEFRO wordmark on top. No header menu and no navigation tabs: nothing there works signed out.
 * Built only from design-system tokens and components, so a theme change restyles it.
 */
export function EntryFrame({ mock = false, children }: { mock?: boolean; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-page font-ui text-fg">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 pt-4 pb-12 sm:pt-10">
        <header>
          <WordmarkLink href={mockLink("/", mock)} className="flex h-11 w-fit" />
        </header>
        <main id="main" className="flex flex-col gap-6">
          {children}
        </main>
      </div>
    </div>
  );
}

/** The page's one heading: large, medium weight, never bold. */
export function EntryHeading({ children }: { children: React.ReactNode }) {
  return <h1 className="text-heading font-medium tracking-[-0.02em] text-fg">{children}</h1>;
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
