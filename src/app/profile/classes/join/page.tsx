import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DemoLabel } from "@/components/ds";
import { FEATURE_FLAGS } from "@/config/features";
import { suggestedShownName } from "@/domain/teacher/rules";
import { isMockQuery, withMock } from "@/features/demo/demo-mode";
import { JoinClass } from "@/features/teacher/JoinClass";
import { studentLinks } from "@/features/teacher/links";
import { AppShell } from "@/features/shell/AppShell";
import { readAccount } from "@/server/account/account-store";
import { assertServerConfigured } from "@/server/config/boot-check";
import { DEMO_CLASS, DEMO_STUDENT_ACCOUNT_NAME, DEMO_TEACHER, isDemoCode } from "@/server/demo/demo-teacher";
import { findCurrentUserId } from "@/server/identity/current-user";
import { teacherLive } from "@/server/teacher/release";

export const metadata: Metadata = { title: "Join a class" };

/**
 * S1 Join a class → S2 Share (from the Account page). Signed-in students only; a 404 while the Teacher view is off
 * (no parent consent yet). Nothing is stored before "Share with this teacher".
 *
 * `?mock=1`: the demo student; only the demo code DEMO42 works, Share changes the page only. `&code=DEMO42` opens
 * straight on the Share screen (a preview link).
 */
export default async function JoinClassPage(props: PageProps<"/profile/classes/join">) {
  await connection();
  const query = await props.searchParams;
  const mock = isMockQuery(query);
  let suggested = "";
  if (mock) suggested = suggestedShownName(DEMO_STUDENT_ACCOUNT_NAME);
  else {
    if (!teacherLive()) notFound();
    assertServerConfigured();
    const account = await readAccount(await findCurrentUserId());
    if (account.kind !== "registered") notFound();
    suggested = suggestedShownName(account.name);
  }
  const invite = { className: DEMO_CLASS.name, teacherName: DEMO_TEACHER.name };
  const preview = mock && isDemoCode(query.code);
  const accountHref = mock ? withMock(studentLinks.account) : studentLinks.account;

  return (
    <AppShell flags={FEATURE_FLAGS} account={mock ? "mock" : "real"} activeHref="/profile" back={{ href: accountHref, label: "Account" }}>
      {mock && <DemoLabel variant="changes" className="mb-4 bg-card" />}
      <div className="mx-auto max-w-2xl lg:mx-0">
        <JoinClass
          suggestedName={suggested}
          accountHref={accountHref}
          demo={mock}
          demoInvite={mock ? { code: DEMO_CLASS.joinCode, invite } : null}
          demoJoinedHref={mock ? withMock(`${studentLinks.account}?joined=${DEMO_CLASS.joinCode}`) : undefined}
          initialInvite={preview ? invite : null}
          initialCode={preview ? DEMO_CLASS.joinCode : ""}
        />
      </div>
    </AppShell>
  );
}
