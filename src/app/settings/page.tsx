import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Card, CardHeader, DemoLabel, PillButton } from "@/components/ds";
import { FEATURE_FLAGS } from "@/config/features";
import { isMockQuery } from "@/features/demo/demo-mode";
import { ChangePassword } from "@/features/settings/ChangePassword";
import { DeleteAccount } from "@/features/settings/DeleteAccount";
import { MicTest } from "@/features/settings/MicTest";
import { SignOut } from "@/features/settings/SignOut";
import { AppShell } from "@/features/shell/AppShell";
import { readAccount } from "@/server/account/account-store";
import { assertServerConfigured } from "@/server/config/boot-check";
import { findCurrentUserId } from "@/server/identity/current-user";

export const metadata: Metadata = { title: "Settings" };

/*
 * Settings (the gear in the navigation): Test your microphone (record up to 3 s and play it back, nothing saved or
 * uploaded), Change password, Sign out, Delete my account. The last three need an account: a visitor without one is
 * asked to sign in instead. The microphone test's button is the page's one black control. With the `settings` flag
 * off the page does not exist (404).
 *
 * `?mock=1`: the demo student. Every section is shown and works on the page, but nothing is sent: Change password and
 * Delete my account show their screens and say nothing was changed. "Demo mode. Changes are not saved."
 */
export default async function SettingsPage(props: PageProps<"/settings">) {
  if (!FEATURE_FLAGS.settings) notFound();
  const query = await props.searchParams;
  await connection();
  const mock = isMockQuery(query);

  let signedIn = true;
  if (!mock) {
    assertServerConfigured();
    signedIn = (await readAccount(await findCurrentUserId())).kind === "registered";
  }

  return (
    <AppShell flags={FEATURE_FLAGS} account={mock ? "mock" : "real"} activeHref="/settings">
      {mock && <DemoLabel variant="changes" className="mb-4 bg-card" />}
      <h1 className="mb-4 text-title font-medium tracking-[-0.01em] text-fg">Settings</h1>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card aria-labelledby="settings-mic">
          <CardHeader title="Test your microphone" id="settings-mic" />
          <MicTest />
        </Card>
        {signedIn ? (
          <>
            <Card aria-labelledby="settings-password">
              <CardHeader title="Change password" id="settings-password" />
              <ChangePassword demo={mock} />
            </Card>
            <Card aria-labelledby="settings-sign-out">
              <CardHeader title="Sign out" id="settings-sign-out" />
              <SignOut demo={mock} />
            </Card>
            <Card aria-labelledby="settings-delete">
              <CardHeader title="Delete my account" id="settings-delete" />
              <DeleteAccount demo={mock} />
            </Card>
          </>
        ) : (
          <Card aria-labelledby="settings-account">
            <CardHeader title="Your account" id="settings-account" />
            <p className="text-body text-fg-muted">
              You&apos;re practising without an account. Sign in to change your password, sign out or delete your account.
            </p>
            <div className="mt-4">
              <PillButton href="/login?next=/settings" variant="quiet">
                Sign in
              </PillButton>
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
