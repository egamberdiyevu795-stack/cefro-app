import type { Metadata } from "next";
import { Card, DemoLabel } from "@/components/ds";
import { AuthForm } from "@/features/account/AuthForm";
import { safeNextPath } from "@/features/account/safe-next";
import { isMockQuery } from "@/features/demo/demo-mode";
import { SIGN_IN, entryHref } from "@/features/entry/content";
import { EntryFrame, EntryHeading, EntrySwitch } from "@/features/entry/EntryFrame";
import { emailAvailable } from "@/server/email/email";

export const metadata: Metadata = { title: "Sign in" };

/**
 * Sign in ("Welcome back"): email, password, "Forgot password?" (only when this server can send the email; always in mock
 * mode), the black "Sign in". `?next=` (a path on this site) is where the student goes after it.
 */
export default async function Page(props: PageProps<"/login">) {
  const query = await props.searchParams;
  const next = safeNextPath(query.next);
  const mock = isMockQuery(query);
  return (
    <EntryFrame mock={mock}>
      {mock && <DemoLabel variant="entry" className="w-fit bg-card" />}
      <EntryHeading>{SIGN_IN.heading}</EntryHeading>
      <Card>
        <AuthForm mode="login" next={next} mock={mock} forgotHref={mock || emailAvailable() ? entryHref("/forgot-password", { mock }) : undefined} />
      </Card>
      <EntrySwitch text={SIGN_IN.switchText} link={SIGN_IN.switchLink} href={entryHref("/register", { next, mock })} />
    </EntryFrame>
  );
}
