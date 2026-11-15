import type { Metadata } from "next";
import { Card, DemoLabel } from "@/components/ds";
import { ResetPasswordForm } from "@/features/account/PasswordResetForms";
import { isMockQuery } from "@/features/demo/demo-mode";
import { RESET, entryHref } from "@/features/entry/content";
import { EntryFrame, EntryHeading } from "@/features/entry/EntryFrame";

export const metadata: Metadata = { title: "Choose a new password", referrer: "no-referrer" };

/**
 * The page the reset email links to (`/reset-password?token=…`): the new password, the black "Save new password".
 * The token is checked only when the form is sent (an expired or used link says so then, with "Send a new link"); no
 * token at all says so at once. Done: "Sign in". No referrer is sent from this page, so the token never leaves it.
 */
export default async function Page(props: PageProps<"/reset-password">) {
  const query = await props.searchParams;
  const mock = isMockQuery(query);
  const token = typeof query.token === "string" ? query.token : "";
  return (
    <EntryFrame mock={mock}>
      {mock && <DemoLabel variant="entry" className="w-fit bg-card" />}
      <section className="space-y-3">
        <EntryHeading>{RESET.heading}</EntryHeading>
        <p className="text-lead text-fg-muted">{RESET.line}</p>
      </section>
      <Card>
        <ResetPasswordForm token={token} mock={mock} signInHref={entryHref("/login", { mock })} forgotHref={entryHref("/forgot-password", { mock })} />
      </Card>
    </EntryFrame>
  );
}
