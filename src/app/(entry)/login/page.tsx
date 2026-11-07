import type { Metadata } from "next";
import { Card, DemoLabel } from "@/components/ds";
import { AuthForm } from "@/features/account/AuthForm";
import { safeNextPath } from "@/features/account/safe-next";
import { isMockQuery } from "@/features/demo/demo-mode";
import { entryHref } from "@/features/entry/content";
import { EntryFrame, EntryHeading, EntrySwitch } from "@/features/entry/EntryFrame";

export const metadata: Metadata = { title: "Sign in" };

/** Sign in: email, password, the black "Sign in". `?next=` (a path on this site) is where the student goes after it. */
export default async function Page(props: PageProps<"/login">) {
  const query = await props.searchParams;
  const next = safeNextPath(query.next);
  const mock = isMockQuery(query);
  return (
    <EntryFrame mock={mock}>
      {mock && <DemoLabel variant="entry" className="w-fit bg-card" />}
      <EntryHeading>Sign in</EntryHeading>
      <Card>
        <AuthForm mode="login" next={next} mock={mock} />
      </Card>
      <EntrySwitch text="New here?" link="Create account" href={entryHref("/register", { next, mock })} />
    </EntryFrame>
  );
}
