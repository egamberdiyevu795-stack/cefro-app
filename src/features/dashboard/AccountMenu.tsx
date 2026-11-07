"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, Menu, cx, styles, type MenuItem } from "@/components/ds";
import { mockLink } from "@/features/demo/demo-mode";
import { ACCOUNT } from "./mock-data";

type AccountState = { state: "loading" } | { state: "anonymous" } | { state: "authenticated"; email: string; name: string | null };

const PANEL = {
  // Rail on desktop, bottom bar on phones: the menu opens beside / above the icon.
  rail: "bottom-full right-0 mb-2 lg:bottom-0 lg:left-full lg:right-auto lg:mb-0 lg:ml-2",
  // A page header (top right): the menu opens below the icon.
  header: "right-0 top-full mt-1",
};

/**
 * The Account item: always visible, whatever the feature flags. Opens a small menu.
 *
 * - `source="real"` (every real page): asks the server who is signed in (`/api/account/me`). Signed in: their name
 *   and email, then Log out (the real sign-out endpoint, then the sign-in page). Not signed in: "Practising without an
 *   account", then Sign in and Create account.
 * - `source="mock"` (mock mode `?mock=1`, and the design prototypes): the demo account's name and email, and that
 *   sign-in is off. Only "Your account" (with ?mock=1): mock mode calls no API, sign-out included, and never leads to a real page.
 *
 * Used only in the `(site)` header (home, sign-in, register); the app's navigation has the Account tab instead
 * (`AccountTab`). Every state has "Your account" first (`/profile`; `/profile?mock=1` in mock mode).
 *
 * `data-testid="account-status"` and `data-state` say which state it is in (anonymous / authenticated), for tests.
 */
export function AccountMenu({
  source = "mock",
  placement = "rail",
}: {
  source?: "mock" | "real";
  placement?: "rail" | "header";
}) {
  const router = useRouter();
  // A layout keeps this menu mounted across pages (e.g. login → home): ask again after every navigation, so signing
  // in or out on one page shows on the next.
  const pathname = usePathname();
  const [account, setAccount] = useState<AccountState>(
    source === "mock" ? { state: "authenticated", email: ACCOUNT.email, name: ACCOUNT.name } : { state: "loading" },
  );

  useEffect(() => {
    if (source === "mock") return;
    let cancelled = false;
    fetch("/api/account/me", { credentials: "same-origin", cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { state: "anonymous" }))
      .then((body) => {
        if (cancelled) return;
        setAccount(
          body.state === "authenticated"
            ? { state: "authenticated", email: String(body.email), name: typeof body.name === "string" ? body.name : null }
            : { state: "anonymous" },
        );
      })
      .catch(() => !cancelled && setAccount({ state: "anonymous" }));
    return () => {
      cancelled = true;
    };
  }, [source, pathname]);

  async function logOut() {
    await fetch("/api/auth/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", credentials: "same-origin" }).catch(
      () => undefined,
    );
    if (source === "real") setAccount({ state: "anonymous" });
    router.push("/login");
    router.refresh();
  }

  const profile: MenuItem = { label: "Your account", onSelect: () => router.push(mockLink("/profile", source === "mock")) };
  const items: MenuItem[] =
    account.state === "loading"
      ? []
      : source === "mock"
      ? [profile]
      : account.state === "authenticated"
      ? [profile, { label: "Log out", onSelect: () => void logOut() }]
      : [
          profile,
          { label: "Sign in", onSelect: () => router.push("/login") },
          { label: "Create account", onSelect: () => router.push("/register") },
        ];

  const header =
    account.state === "authenticated" ? (
      <>
        <p className="text-label font-semibold text-fg">{account.name ?? account.email.split("@")[0]}</p>
        <p className="text-caption text-fg-muted">{account.email}</p>
        {source === "mock" && <p className="mt-1 text-caption text-fg-muted">Demo account. Sign-in is off in demo mode.</p>}
      </>
    ) : account.state === "anonymous" ? (
      <>
        <p className="text-label font-semibold text-fg">Practising without an account</p>
        <p className="text-caption text-fg-muted">Your answers are kept in this browser.</p>
      </>
    ) : (
      <p className="text-caption text-fg-muted">Loading…</p>
    );

  return (
    <div data-testid="account-status" data-state={account.state}>
      <Menu
        label="Account"
        trigger={<Icon name="user" size={20} />}
        triggerClassName={cx(styles.NAV_ITEM, styles.NAV_ITEM_IDLE)}
        panelClassName={PANEL[placement]}
        header={header}
        items={items}
      />
    </div>
  );
}
