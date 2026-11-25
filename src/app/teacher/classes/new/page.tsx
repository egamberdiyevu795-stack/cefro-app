import type { Metadata } from "next";
import { connection } from "next/server";
import { Card, CardHeader, DemoLabel } from "@/components/ds";
import { FEATURE_FLAGS } from "@/config/features";
import { CreateClassForm } from "@/features/teacher/actions";
import { teacherLinks } from "@/features/teacher/links";
import { AppShell } from "@/features/shell/AppShell";
import { teacherPage } from "@/server/teacher/page-context";

export const metadata: Metadata = { title: "Create class" };

/**
 * T2 Create class: the name, the black "Create class"; then the code, large ("Students enter this on their Account
 * page"), and the black "Copy code". Teachers only (404 otherwise, and while the Teacher view is off). `?mock=1`: the
 * demo teacher; creating shows the demo class's code and saves nothing.
 */
export default async function NewClassPage(props: PageProps<"/teacher/classes/new">) {
  await connection();
  const page = await teacherPage(await props.searchParams);
  const home = page.href(teacherLinks.home);
  return (
    <AppShell flags={FEATURE_FLAGS} account={page.mock ? "mock" : "real"} activeHref="/dashboard" demoTeacher={page.mock} back={{ href: home, label: "Home" }}>
      {page.mock && <DemoLabel variant="class" className="mb-4 bg-card" />}
      {/* The form on the left and what happens next beside it, as on the class page, so the right half is not empty. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.44fr)] lg:items-start">
        <Card aria-labelledby="new-class-title">
          <h1 id="new-class-title" className="mb-5 text-title font-medium tracking-[-0.01em] text-fg">
            Create class
          </h1>
          <CreateClassForm demo={page.mock} />
        </Card>
        <Card aria-labelledby="next-title">
          <CardHeader id="next-title" title="What happens next" />
          <ol className="flex list-decimal flex-col gap-2 pl-4 text-body text-fg-muted marker:text-fg-subtle">
            <li>The class gets a join code you give your students.</li>
            <li>They enter it on their Account page, and their scored answers start showing in the class.</li>
            <li>From the class you can start an exam laptop for a full mock, and rate what the app scored.</li>
          </ol>
        </Card>
      </div>
    </AppShell>
  );
}
