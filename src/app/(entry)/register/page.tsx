import type { Metadata } from "next";
import { Card, DemoLabel } from "@/components/ds";
import { AuthForm } from "@/features/account/AuthForm";
import { safeNextPath } from "@/features/account/safe-next";
import { isMockQuery } from "@/features/demo/demo-mode";
import { REGISTER, entryHref } from "@/features/entry/content";
import { EntryFrame, EntryHeading, EntrySwitch } from "@/features/entry/EntryFrame";

export const metadata: Metadata = { title: "Create account" };

/**
 * Create account ("Save your results"): email and password ("At least 8 characters."), the black "Create account". No
 * name here: it is set later on the Account page (the account starts with none). What the browser practised before
 * signing up is kept (the anonymous identity is merged into the account by the server).
 */
export default async function Page(props: PageProps<"/register">) {
  const query = await props.searchParams;
  const next = safeNextPath(query.next);
  const mock = isMockQuery(query);
  return (
    <EntryFrame mock={mock}>
      {mock && <DemoLabel variant="entry" className="w-fit bg-card" />}
      <section className="space-y-3">
        <EntryHeading>{REGISTER.heading}</EntryHeading>
        <p className="text-lead text-fg-muted">{REGISTER.line}</p>
      </section>
      <Card>
        <AuthForm mode="register" next={next} mock={mock} />
      </Card>
      <EntrySwitch text={REGISTER.switchText} link={REGISTER.switchLink} href={entryHref("/login", { next, mock })} />
    </EntryFrame>
  );
}
