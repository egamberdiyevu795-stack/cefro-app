"use client";

import { useRouter } from "next/navigation";
import { Icon, Menu, cx, styles } from "@/components/ds";
import { ACCOUNT } from "./mock-data";

/**
 * Account item in the nav: always visible, whatever the feature flags. Opens a menu with the (mocked) account and
 * Log out. Log out uses the app's real sign-out endpoint, then goes to the sign-in page.
 */
export function AccountMenu() {
  const router = useRouter();

  async function logOut() {
    await fetch("/api/auth/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", credentials: "same-origin" }).catch(
      () => undefined,
    );
    router.push("/login");
    router.refresh();
  }

  return (
    <Menu
      label="Account"
      trigger={<Icon name="user" size={20} />}
      triggerClassName={cx(styles.NAV_ITEM, styles.NAV_ITEM_IDLE)}
      panelClassName="bottom-full right-0 mb-2 lg:bottom-0 lg:left-full lg:right-auto lg:mb-0 lg:ml-2"
      header={
        <>
          <p className="text-label font-semibold text-fg">{ACCOUNT.name}</p>
          <p className="text-caption text-fg-muted">{ACCOUNT.email}</p>
        </>
      }
      items={[{ label: "Log out", onSelect: () => void logOut() }]}
    />
  );
}
