import type { Metadata } from "next";
import { Card, DemoLabel } from "@/components/ds";
import { AuthForm } from "@/features/account/AuthForm";
import { safeNextPath } from "@/features/account/safe-next";
import { isMockQuery } from "@/features/demo/demo-mode";
import { entryHref } from "@/features/entry/content";
import { EntryFrame, EntryHeading, EntrySwitch } from "@/features/entry/EntryFrame";

export const metadata: Metadata = { title: "Create account" };

/**
 * Create account: name, email, password ("At least 8 characters."), the black "Create account". What the browser
 * practised before signing up is kept (the anonymous identity is merged into the account by the server).
 */
export default async function Page(props: PageProps<"/register">) {
  const query = await props.searchParams;
  const next = safeNextPath(query.next);
  const mock = isMockQuery(query);
  return (
    <EntryFrame mock={mock}>
      {mock && <DemoLabel variant="entry" className="w-fit bg-card" />}
      <EntryHeading>Create account</EntryHeading>
      <Card>
        <AuthForm mode="register" next={next} mock={mock} />
      </Card>
      <EntrySwitch text="Have an account?" link="Sign in" href={entryHref("/login", { next, mock })} />
    </EntryFrame>
  );
}
