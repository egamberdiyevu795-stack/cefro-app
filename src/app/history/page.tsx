import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { FEATURE_FLAGS } from "@/config/features";
import { buildHistoryView, parseHistoryQuery } from "@/features/history/view-model";
import { HistoryContent } from "@/features/history/sections";
import { AppShell } from "@/features/shell/AppShell";
import { listAttemptHistory } from "@/server/attempts/attempt-service";
import { assertServerConfigured } from "@/server/config/boot-check";
import { findCurrentUserId } from "@/server/identity/current-user";

export const metadata: Metadata = { title: "History" };

/*
 * Every attempt of the student, newest first (`?part=1.1|1.2|2|3` filters, `?show=40` shows more). Only the owner's
 * attempts: the caller is identified exactly as on the result page (`findCurrentUserId`: the signed-in account, else
 * the browser's anonymous identity), and only rows recorded under that id are read. A caller with no identity yet has
 * no attempts and sees the empty state. With the `history` flag off the page does not exist (404).
 */
export default async function HistoryPage(props: PageProps<"/history">) {
  if (!FEATURE_FLAGS.history) notFound();
  await connection();
  assertServerConfigured();
  const userId = await findCurrentUserId();
  const attempts = userId ? await listAttemptHistory(userId) : [];
  const view = buildHistoryView(attempts, parseHistoryQuery(await props.searchParams));

  return (
    <AppShell flags={FEATURE_FLAGS} account="real" activeHref="/history">
      <HistoryContent view={view} />
    </AppShell>
  );
}
