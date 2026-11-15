import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DemoLabel } from "@/components/ds";
import { FEATURE_FLAGS } from "@/config/features";
import { demoAttempts, demoHref } from "@/server/demo/demo-data";
import { DEMO_MOCK_HREF, demoMockHistory, demoMockPartHref } from "@/server/demo/demo-mock";
import { isMockQuery, withMock } from "@/features/demo/demo-mode";
import { buildHistoryView, parseHistoryQuery, type HistoryView } from "@/features/history/view-model";
import { HistoryContent } from "@/features/history/sections";
import { AppShell } from "@/features/shell/AppShell";
import { listAttemptHistory } from "@/server/attempts/attempt-service";
import { assertServerConfigured } from "@/server/config/boot-check";
import { findCurrentUserId } from "@/server/identity/current-user";
import { listMockHistory } from "@/server/sessions/mock-history";

export const metadata: Metadata = { title: "History" };

/*
 * Every attempt of the student, newest first (`?part=1.1|1.2|2|3|mock` filters, `?show=40` shows more). Only the owner's
 * attempts: the caller is identified exactly as on the result page (`findCurrentUserId`: the signed-in account, else
 * the browser's anonymous identity), and only rows recorded under that id are read. A caller with no identity yet has
 * no attempts and sees the empty state. With the `history` flag off the page does not exist (404).
 *
 * `?mock=1` (mock mode): the demo student's attempts (server/demo/demo-data.ts) through the same view model. No
 * configuration check, no cookie, no database; every link keeps ?mock=1 and the demo label is shown.
 */
export default async function HistoryPage(props: PageProps<"/history">) {
  if (!FEATURE_FLAGS.history) notFound();
  const query = await props.searchParams;
  await connection();

  if (isMockQuery(query)) {
    const now = new Date();
    const demoMock = await demoMockHistory(now);
    const view = buildHistoryView([...(await demoAttempts(now)), ...demoMock.attempts], parseHistoryQuery(query), demoMock.mocks);
    return (
      <AppShell flags={FEATURE_FLAGS} account="mock" activeHref="/history">
        <DemoLabel variant="data" className="mb-4 bg-card" />
        <HistoryContent view={demoView(view)} mock />
      </AppShell>
    );
  }

  assertServerConfigured();
  const userId = await findCurrentUserId();
  const attempts = userId ? await listAttemptHistory(userId) : [];
  const mocks = userId ? await listMockHistory(userId) : [];
  const view = buildHistoryView(attempts, parseHistoryQuery(query), mocks);

  return (
    <AppShell flags={FEATURE_FLAGS} account="real" activeHref="/history">
      <HistoryContent view={view} />
    </AppShell>
  );
}

/** The same view with mock-mode links: rows open the demo results; the filter and "Show more" keep ?mock=1. */
function demoView(view: HistoryView): HistoryView {
  return {
    ...view,
    filters: view.filters.map((f) => ({ ...f, href: withMock(f.href) })),
    rows: view.rows.map((row) => ({ ...row, href: row.mock ? DEMO_MOCK_HREF : (demoMockPartHref(row.href) ?? demoHref(row.href)) })),
    moreHref: view.moreHref && withMock(view.moreHref),
  };
}
