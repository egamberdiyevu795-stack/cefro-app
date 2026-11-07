"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, cx, styles } from "@/components/ds";
import { mockLink } from "@/features/demo/demo-mode";

type State = "loading" | "anonymous" | "authenticated";

/**
 * The Account tab, last in the navigation: a plain link to the Account page (`/profile`; `/profile?mock=1` in mock
 * mode), no menu. On the Account page it is the current tab (grey square, `aria-current="page"`, never black).
 *
 * `data-testid="account-status"` and `data-state` say whether the browser is signed in (anonymous / authenticated):
 * real pages ask `/api/account/me` again after every navigation; mock mode is the demo account and asks nothing.
 */
export function AccountTab({ source, active = false }: { source: "mock" | "real"; active?: boolean }) {
  const pathname = usePathname();
  const [state, setState] = useState<State>(source === "mock" ? "authenticated" : "loading");

  useEffect(() => {
    if (source === "mock") return;
    let cancelled = false;
    fetch("/api/account/me", { credentials: "same-origin", cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { state: "anonymous" }))
      .then((body: { state?: string }) => !cancelled && setState(body.state === "authenticated" ? "authenticated" : "anonymous"))
      .catch(() => !cancelled && setState("anonymous"));
    return () => {
      cancelled = true;
    };
  }, [source, pathname]);

  return (
    <div data-testid="account-status" data-state={state}>
      <Link
        href={mockLink("/profile", source === "mock")}
        aria-label="Account"
        aria-current={active ? "page" : undefined}
        title="Account"
        className={cx(styles.NAV_ITEM, active ? styles.NAV_ITEM_ACTIVE : styles.NAV_ITEM_IDLE)}
      >
        <Icon name="user" size={20} />
      </Link>
    </div>
  );
}
