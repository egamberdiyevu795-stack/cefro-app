import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { FEATURE_FLAGS } from "@/config/features";
import { MockFinishedCard } from "@/features/full-mock/screens";
import { AppShell } from "@/features/shell/AppShell";
import { assertServerConfigured } from "@/server/config/boot-check";
import { HttpError } from "@/server/errors";
import { findCurrentUserId } from "@/server/identity/current-user";
import { getMock, type MockView } from "@/server/sessions/mock-service";

export const metadata: Metadata = { title: "Mock finished" };

async function ownMock(userId: string, id: string): Promise<MockView | null> {
  try {
    return await getMock(userId, id);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error; // e.g. the database is unreachable: the error screen, not "not found"
  }
}

/*
 * "Mock finished" (docs/v1-plan.md, step 2; the overall mock result is step 4): the caller's own mock with a link to each
 * part's own result page (/result/[attemptId]). Owner only: a missing, malformed or someone else's mock is a 404. A mock still
 * in progress goes back to the runner; one that ran out of its 24 hours says "Mock not finished" and keeps its parts' results.
 */
export default async function MockFinishedPage(props: PageProps<"/practice/mock/[sessionId]">) {
  const { sessionId } = await props.params;
  await connection();
  assertServerConfigured();
  const userId = await findCurrentUserId();
  const mock = userId ? await ownMock(userId, sessionId) : null;
  if (!mock) notFound();
  if (mock.status === "in_progress") redirect("/practice/mock");
  return (
    <AppShell flags={FEATURE_FLAGS} account="real">
      <MockFinishedCard
        status={mock.status}
        practiceHref="/practice"
        parts={mock.parts.map((p) => ({ part: p.part, href: p.attemptId ? `/result/${encodeURIComponent(p.attemptId)}` : null, title: p.taskTitle }))}
      />
    </AppShell>
  );
}
