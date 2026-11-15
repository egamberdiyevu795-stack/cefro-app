import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { FEATURE_FLAGS, allFlags, type FeatureFlags } from "@/config/features";
import { isMockQuery } from "@/features/demo/demo-mode";
import { MockResult } from "@/features/mock-result/MockResult";
import type { MockResultSource } from "@/features/mock-result/part-source";
import { AppShell } from "@/features/shell/AppShell";
import { assertServerConfigured } from "@/server/config/boot-check";
import { demoMockOptions, demoMockResult, DEMO_MOCK_ID } from "@/server/demo/demo-mock";
import { HttpError } from "@/server/errors";
import { findCurrentUserId } from "@/server/identity/current-user";
import { getMockResult } from "@/server/sessions/mock-result";

export const metadata: Metadata = { title: "Mock result" };

async function ownMockResult(userId: string, id: string): Promise<MockResultSource | null> {
  try {
    return await getMockResult(userId, id);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error; // e.g. the database is unreachable: the error screen, not "not found"
  }
}

/*
 * The mock result (docs/v1-plan.md, step 4): the speaking-only estimate with its line, one row per part (each fills in as it is
 * scored), and the biggest fix across the mock. Owner only: a missing, malformed or someone else's mock is a 404, the same
 * answer as the API. A mock still in progress goes back to the runner; one that ran out of its 24 hours says "Not finished"
 * and keeps its parts' results.
 *
 *   ?mock=1   a demo mock result with demo answers (server/demo/demo-mock.ts): no account, no database, no API call. Only
 *             `/practice/mock/demo?mock=1`; any other id is a 404 in mock mode too. `&state=scoring|unfinished|pending`
 *             and `&teacher=1` show the other states.
 */
export default async function MockResultPage(props: PageProps<"/practice/mock/[sessionId]">) {
  const { sessionId } = await props.params;
  const query = await props.searchParams;

  if (isMockQuery(query)) {
    if (sessionId !== DEMO_MOCK_ID) notFound();
    const flags: FeatureFlags = query.flags === "off" ? allFlags(false) : FEATURE_FLAGS;
    return (
      <AppShell flags={flags} account="mock">
        <MockResult initial={await demoMockResult(demoMockOptions(query))} demo practiceHref="/practice?mock=1" />
      </AppShell>
    );
  }

  await connection();
  assertServerConfigured();
  const userId = await findCurrentUserId();
  const result = userId ? await ownMockResult(userId, sessionId) : null;
  if (!result) notFound();
  if (result.status === "in_progress") redirect("/practice/mock");
  return (
    <AppShell flags={FEATURE_FLAGS} account="real">
      <MockResult initial={result} practiceHref="/practice" />
    </AppShell>
  );
}
