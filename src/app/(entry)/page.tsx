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
 * - What it is, the black "Start practising" (Create account), three steps, and which exam parts are open (`examStatus`, from `PART_LIVE`).
 * - `?deleted=1` (after "Delete my account", which signs the browser out): "Your account and all your data were
 *   deleted." on top.
 * - `?mock=1`: the same page for a Preview with no variables; nobody is looked up, Start practising / Sign in
 *   keep `?mock=1`, and a grey "See a demo result" (a demo result page, `?mock=1`) sits under Start practising. Normal
 *   use has no demo link: a new visitor sees only their own work.
 *
 * One black control: "Start practising". The two actions sit on a card because the grey pill would vanish on the grey page.
 *
 * Layout (`EntryFrame width="wide"`): phones read it as one column, in the order above. From 1024 px it is two columns,
 * like a desktop landing page: left, the pitch and "Start practising" (the larger `text-display` heading); right, the
 * three steps and the exam parts. The "Built by" line stays last, under both.
 */
export default async function HomePage(props: PageProps<"/">) {
  const query = await props.searchParams;
  const mock = isMockQuery(query);
  if (!mock && (await isSignedIn())) redirect("/dashboard");
  // After "Delete my account" (never in mock mode, where nothing is deleted).
  const deleted = !mock && isAccountDeletedQuery(query);
  const status = examStatus();
  return (
    <EntryFrame mock={mock} width="wide" headerEnd={<EntryHeaderLink href={entryHref("/login", { mock })}>{HOME.signIn}</EntryHeaderLink>}>
      {deleted && (
        <Notice data-testid="account-deleted" className="bg-card font-medium shadow-card">
          {ACCOUNT_DELETED}
        </Notice>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start lg:gap-12">
        <div className="flex flex-col gap-6 lg:gap-8 lg:pt-4">
          <section className="space-y-3 lg:space-y-4">
            <p className="text-label font-medium text-fg-muted">{HOME.eyebrow}</p>
            <EntryHeading className="lg:text-display lg:tracking-[-0.025em]">{HOME.heading}</EntryHeading>
            <p className="text-lead text-fg-muted lg:text-title">{HOME.line}</p>
          </section>

          <Card className="flex flex-col gap-3">
            <PillButton href={entryHref("/register", { mock })} size="lg" className="w-full">
              {HOME.start}
            </PillButton>
            {mock && (
              <PillButton href={DEMO_HREF} variant="quiet" size="lg" className="w-full">
                {HOME.demo}
              </PillButton>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
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
        </div>
      </div>

      <p className="text-caption text-fg-muted" data-testid="built-by">
        {HOME.builtBy}
      </p>
    </EntryFrame>
  );
}
