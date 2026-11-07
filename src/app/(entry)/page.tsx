import { redirect } from "next/navigation";
import { Card, CardHeader, Notice, PillButton } from "@/components/ds";
import { isMockQuery } from "@/features/demo/demo-mode";
import { DEMO_HREF, HOME, entryHref } from "@/features/entry/content";
import { EntryFrame, EntryHeading, EntrySwitch } from "@/features/entry/EntryFrame";
import { ACCOUNT_DELETED, isAccountDeletedQuery } from "@/features/settings/deleted";
import { isSignedIn } from "@/server/identity/current-user";

/**
 * The signed-out home page. A signed-in visitor goes straight to the dashboard. The Part 2 task list is at `/practice`.
 *
 * - `?deleted=1` (after "Delete my account", which signs the browser out): "Your account and all your data were
 *   deleted." on top.
 * - `?mock=1`: the same page for a Preview with no variables; nobody is looked up, and Create account / Sign in keep
 *   `?mock=1`. "Try the demo" always opens the demo dashboard (`/dashboard?mock=1`).
 *
 * One black control: "Create account". "Try the demo" is grey (on a card: the grey pill would vanish on the grey page).
 */
export default async function HomePage(props: PageProps<"/">) {
  const query = await props.searchParams;
  const mock = isMockQuery(query);
  if (!mock && (await isSignedIn())) redirect("/dashboard");
  // After "Delete my account" (never in mock mode, where nothing is deleted).
  const deleted = !mock && isAccountDeletedQuery(query);
  return (
    <EntryFrame mock={mock}>
      {deleted && (
        <Notice data-testid="account-deleted" className="bg-card font-medium shadow-card">
          {ACCOUNT_DELETED}
        </Notice>
      )}
      <section className="space-y-3">
        <EntryHeading>{HOME.heading}</EntryHeading>
        <p className="text-lead text-fg-muted">{HOME.line}</p>
      </section>

      <Card aria-labelledby="example-feedback">
        <CardHeader id="example-feedback" title={HOME.example.title} />
        <div className="border-l-2 border-accent pl-4">
          <p className="text-title font-medium text-fg">{HOME.example.fix}</p>
          <p className="mt-1 text-body text-fg-muted">{HOME.example.detail}</p>
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <PillButton href={entryHref("/register", { mock })} size="lg" className="w-full">
          Create account
        </PillButton>
        <PillButton href={DEMO_HREF} variant="quiet" size="lg" className="w-full">
          Try the demo
        </PillButton>
        <EntrySwitch text="Have an account?" link="Sign in" href={entryHref("/login", { mock })} />
      </Card>
    </EntryFrame>
  );
}
