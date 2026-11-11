import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { FEATURE_FLAGS, allFlags, fullMockLive, type FeatureFlags } from "@/config/features";
import { parseLockPreview } from "@/domain/consent";
import { MOCK_PARTS, pickTaskForPart, remainingParts } from "@/domain/speaking/full-mock";
import type { ExamPartId } from "@/domain/speaking/exam-part";
import { FullMockRunner } from "@/features/full-mock/FullMockRunner";
import { buildMockPlan } from "@/features/full-mock/plan";
import { isMockQuery } from "@/features/demo/demo-mode";
import { AppShell } from "@/features/shell/AppShell";
import { assertServerConfigured } from "@/server/config/boot-check";
import { consentRequired, recordingLockFor } from "@/server/consent/consent";
import { findCurrentUserId } from "@/server/identity/current-user";
import { findInProgressMock, mockTasksForPart, planMockTasks } from "@/server/sessions/mock-service";

export const metadata: Metadata = { title: "Full mock exam" };

/*
 * The full mock exam (docs/v1-plan.md, step 2): "Before you start" (or "Continue your mock"), then Parts 1.1, 1.2, 2 and 3 back
 * to back (features/full-mock). Opened from the "Full mock exam" card on /practice and the dashboard's "Continue your mock".
 *
 *   (no mock)   the REAL mock, only while all four parts are live (or on a test server, CEFRO_TEST_FULL_MOCK_LIVE): a 404
 *               otherwise. Reads who is signed in (creates nothing: the session is made by the Start tap), asks the consent
 *               lock, finds the mock still in progress, and picks one task per part still to do that the student hasn't
 *               done recently.
 *   ?mock=1     mock mode: no account, no database, no API call. The first task of every part with its demo answers; "Mock
 *               finished" links to each part's demo result. Works whatever the part switches say.
 *   ?mock=1&timeScale=0.05   browser tests only: shorter preparation and speaking time (Parts 1 and 3).
 *   ?mock=1&consent=waiting|withdrawn|guest   mock mode: preview the locked screen.
 */
export default async function FullMockPage(props: PageProps<"/practice/mock">) {
  const query = await props.searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const flags: FeatureFlags = one(query.flags) === "off" ? allFlags(false) : FEATURE_FLAGS;

  if (isMockQuery(query)) {
    const ids: Partial<Record<ExamPartId, string>> = {};
    for (const part of MOCK_PARTS) ids[part] = pickTaskForPart(mockTasksForPart(part), [], () => 0)?.id;
    const scale = Number(one(query.timeScale));
    return (
      <AppShell flags={flags} account="mock">
        <FullMockRunner
          mock
          plans={buildMockPlan(MOCK_PARTS, ids)}
          finished={[]}
          lock={parseLockPreview(one(query.consent))}
          timeScale={scale > 0 && scale <= 1 ? scale : 1}
        />
      </AppShell>
    );
  }

  if (!fullMockLive()) notFound();
  await connection();
  assertServerConfigured();
  const userId = await findCurrentUserId();
  const lock = consentRequired() ? await recordingLockFor(userId) : null;
  const inProgress = userId ? await findInProgressMock(userId) : null;
  const finished = inProgress?.parts.filter((p) => p.attemptId).map((p) => p.part) ?? [];
  const todo = remainingParts(finished.map((part) => ({ part })));
  const plans = buildMockPlan(todo, await planMockTasks(userId, todo));

  return (
    <AppShell flags={flags} account="real">
      <FullMockRunner mock={false} plans={plans} finished={finished} lock={lock} />
    </AppShell>
  );
}
