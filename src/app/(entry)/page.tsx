import { redirect } from "next/navigation";
import { Card, Icon, Notice, PillButton, StatRow } from "@/components/ds";
import { isMockQuery } from "@/features/demo/demo-mode";
import { DEMO_HREF, HOME, entryHref, examStatus } from "@/features/entry/content";
import { EntryFrame, EntryHeaderLink, EntryHeading } from "@/features/entry/EntryFrame";
import { ACCOUNT_DELETED, isAccountDeletedQuery } from "@/features/settings/deleted";
import { isSignedIn } from "@/server/identity/current-user";

/**
 * The signed-out home page. A signed-in visitor goes straight to the dashboard. The task list is at `/practice`.
 *
 * - Top row: the CEFRO wordmark, and a small grey "Sign in" on the right.
 * - What it is, the black "Start practising" (Create account) and the grey "See a demo result" (a real demo result
 *   page, always `?mock=1`), three steps, and which exam parts are open (`examStatus`, from `PART_LIVE`).
 * - `?deleted=1` (after "Delete my account", which signs the browser out): "Your account and all your data were
 *   deleted." on top.
 * - `?mock=1`: the same page for a Preview with no variables; nobody is looked up, and Start practising / Sign in
 *   keep `?mock=1`.
 *
 * One black control: "Start practising". The two actions sit on a card because the grey pill would vanish on the grey page.
 */
export default async function HomePage(props: PageProps<"/">) {
  const query = await props.searchParams;
  const mock = isMockQuery(query);
  if (!mock && (await isSignedIn())) redirect("/dashboard");
  // After "Delete my account" (never in mock mode, where nothing is deleted).
  const deleted = !mock && isAccountDeletedQuery(query);
  const status = examStatus();
  return (
    <EntryFrame mock={mock} headerEnd={<EntryHeaderLink href={entryHref("/login", { mock })}>{HOME.signIn}</EntryHeaderLink>}>
      {deleted && (
        <Notice data-testid="account-deleted" className="bg-card font-medium shadow-card">
          {ACCOUNT_DELETED}
        </Notice>
      )}
      <section className="space-y-3">
        <p className="text-label font-medium text-fg-muted">{HOME.eyebrow}</p>
        <EntryHeading>{HOME.heading}</EntryHeading>
        <p className="text-lead text-fg-muted">{HOME.line}</p>
      </section>

      <Card className="flex flex-col gap-3">
        <PillButton href={entryHref("/register", { mock })} size="lg" className="w-full">
          {HOME.start}
        </PillButton>
        <PillButton href={DEMO_HREF} variant="quiet" size="lg" className="w-full">
          {HOME.demo}
        </PillButton>
      </Card>

      <Card aria-labelledby="how-it-works">
        <h2 id="how-it-works" className="sr-only">
          How it works
        </h2>
        <ol className="flex flex-col gap-5">
          {HOME.steps.map((step) => (
            <li key={step.title} className="flex items-start gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-well text-fg">
                <Icon name={step.icon} />
              </span>
              <div>
                <h3 className="text-body font-semibold text-fg">{step.title}</h3>
                <p className="text-body text-fg-muted">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <section aria-labelledby="exam-parts" data-testid="exam-status">
        <h2 id="exam-parts" className="sr-only">
          Exam parts
        </h2>
        {status.kind === "all-open" ? (
          <p className="text-body text-fg-muted">{status.text}</p>
        ) : (
          <Card className="py-3 sm:py-3">
            <dl>
              {status.rows.map((row) => (
                <StatRow key={row.label} label={row.label} value={row.status} />
              ))}
            </dl>
          </Card>
        )}
      </section>

      <p className="text-caption text-fg-muted" data-testid="built-by">
        {HOME.builtBy}
      </p>
    </EntryFrame>
  );
}
