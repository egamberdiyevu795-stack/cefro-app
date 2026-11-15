import type { Metadata } from "next";
import { Card, DemoLabel, Notice } from "@/components/ds";
import { ForgotPasswordForm } from "@/features/account/PasswordResetForms";
import { isMockQuery } from "@/features/demo/demo-mode";
import { FORGOT, entryHref } from "@/features/entry/content";
import { EntryFrame, EntryHeading, EntrySwitch } from "@/features/entry/EntryFrame";
import { emailAvailable } from "@/server/email/email";

export const metadata: Metadata = { title: "Forgot password" };

/**
 * "Forgot password?" (from Sign in): the email, the black "Send link". Afterwards the same words whether or not the
 * address has an account. When this server cannot send email (docs/password-reset.md) the page says so and shows no
 * form (Sign in does not link here then). Mock mode: the form works and sends nothing.
 */
export default async function Page(props: PageProps<"/forgot-password">) {
  const mock = isMockQuery(await props.searchParams);
  const available = mock || emailAvailable();
  return (
    <EntryFrame mock={mock}>
      {mock && <DemoLabel variant="entry" className="w-fit bg-card" />}
      <section className="space-y-3">
        <EntryHeading>{FORGOT.heading}</EntryHeading>
        {available && <p className="text-lead text-fg-muted">{FORGOT.line}</p>}
      </section>
      <Card>{available ? <ForgotPasswordForm mock={mock} /> : <Notice>{FORGOT.unavailable}</Notice>}</Card>
      <EntrySwitch text={FORGOT.switchText} link={FORGOT.switchLink} href={entryHref("/login", { mock })} />
    </EntryFrame>
  );
}
