import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader, DemoLabel, Icon, cx, styles } from "@/components/ds";
import { FEATURE_FLAGS, PART_LIVE, allFlags, type FeatureFlags } from "@/config/features";
import { listArgumentTasks } from "@/content/speaking/part3";
import { isMockQuery } from "@/features/demo/demo-mode";
import { part3PracticeHref } from "@/features/part3/links";
import { AppShell } from "@/features/shell/AppShell";

export const metadata: Metadata = { title: "Part 3 demo" };

/*
 * The Part 3 topics in mock mode (`?mock=1`). Without ?mock=1 this page is a 404 while Part 3 is not live
 * (`PART_LIVE["3"]`: the dashboard and the home page say "Coming soon"), and, once it is live, sends the student to
 * Part 3's card on the task list.
 */
export default async function Part3ListPage(props: PageProps<"/practice/part3">) {
  const query = await props.searchParams;
  if (!isMockQuery(query)) {
    // Real: the topics are Part 3's card on the task list, once Part 3 is live; otherwise there is no page.
    if (PART_LIVE["3"]) redirect("/practice#part-3");
    notFound();
  }
  const flags: FeatureFlags = query.flags === "off" ? allFlags(false) : FEATURE_FLAGS;
  return (
    <AppShell flags={flags} account="mock">
      <div className="mx-auto max-w-2xl space-y-4">
        <DemoLabel variant="mode" className="bg-card" />
        <Card aria-labelledby="part3-title">
          <p className="text-caption text-fg-muted">Speaking · Part 3 · C1</p>
          <h1 id="part3-title" className="mt-1 text-stat font-light tracking-[-0.03em] text-fg">
            Balanced argument
          </h1>
          <p className="mt-3 text-body text-fg">
            A statement with a list of Pros and a list of Cons, as in the real exam. Argue both sides, with two points from each
            list: 1 minute to prepare, 2 minutes to speak.
          </p>
          <p className="mt-2 text-label text-fg-muted">
            {PART_LIVE["3"] ? "Part 3 is open." : "Part 3 is coming soon. This demo shows made-up results; nothing you say is sent."}
          </p>
        </Card>
        <Card aria-labelledby="topics-title">
          <CardHeader id="topics-title" title="Topics" />
          <ul className="-my-1 divide-y divide-line">
            {listArgumentTasks().map((task) => (
              <li key={task.id}>
                <Link
                  href={part3PracticeHref(task.id)}
                  aria-label={`Start: ${task.title}`}
                  className={cx("flex min-h-14 items-center gap-3 py-2.5 hover:text-fg", styles.FOCUS_RING)}
                >
                  <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-well text-fg">
                    <Icon name="mic" size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-body font-semibold text-fg">{task.title}</span>
                    <span className="block text-label text-fg-muted">{task.statement}</span>
                  </span>
                  <Icon name="chevronDown" size={16} className="-rotate-90 shrink-0 text-fg-subtle" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </AppShell>
  );
}
