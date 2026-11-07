import type { Metadata } from "next";
import { connection } from "next/server";
import { DemoLabel } from "@/components/ds";
import { FEATURE_FLAGS } from "@/config/features";
import { addDays, examDateState, MAX_DAYS_AHEAD, todayIn, type ExamDateState } from "@/domain/exam-date";
import { ExamDate } from "@/features/dashboard/ExamDate";
import { isMockQuery } from "@/features/demo/demo-mode";
import { AccountCard, LevelCard } from "@/features/profile/sections";
import { currentLevel } from "@/features/profile/view-model";
import { AppShell } from "@/features/shell/AppShell";
import { readAccount, type AccountInfo } from "@/server/account/account-store";
import { listAttemptHistory } from "@/server/attempts/attempt-service";
import { assertServerConfigured } from "@/server/config/boot-check";
import { demoAccount, demoAttempts, demoExamDate } from "@/server/demo/demo-data";
import { readExamDate } from "@/server/exam-date/exam-date-store";
import { findCurrentUserId } from "@/server/identity/current-user";

export const metadata: Metadata = { title: "Profile" };

/*
 * Profile (the Account item's "Profile"): name (editable) and email (shown), the exam date (the dashboard's editor and
 * rules), the current level (latest scored Part 2 answer, never invented), member since and the number of practice
 * attempts. Only the caller's own data (`findCurrentUserId`, the History rule). A visitor without an account sees their
 * browser's attempts and exam date, and Sign in / Create account instead of a name and email.
 *
 * `?mock=1`: the demo student (server/demo/demo-data.ts) through the same code. No configuration check, no cookie, no
 * database, no API call: the name and exam date change only on the page. "Demo mode. Changes are not saved."
 */
export default async function ProfilePage(props: PageProps<"/profile">) {
  const query = await props.searchParams;
  await connection();
  const now = new Date();
  const mock = isMockQuery(query);

  let account: AccountInfo;
  let attempts;
  let stored;
  if (mock) {
    account = demoAccount(now);
    attempts = await demoAttempts(now);
    stored = demoExamDate(now);
  } else {
    assertServerConfigured();
    const userId = await findCurrentUserId();
    account = await readAccount(userId);
    attempts = userId ? await listAttemptHistory(userId) : [];
    stored = userId ? await readExamDate(userId) : { examDate: null, examDateSkippedAt: null };
  }

  const today = todayIn(now);
  return (
    <AppShell flags={FEATURE_FLAGS} account={mock ? "mock" : "real"} activeHref="/profile">
      {mock && <DemoLabel variant="changes" className="mb-4 bg-card" />}
      <h1 className="mb-4 text-title font-medium tracking-[-0.01em] text-fg">Profile</h1>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AccountCard account={account} attempts={attempts.length} mock={mock} />
        <div className="flex flex-col gap-4">
          <ExamDate state={profileExamState(examDateState(stored, now))} today={today} max={addDays(today, MAX_DAYS_AHEAD)} variant="card" demo={mock} />
          <LevelCard level={currentLevel(attempts)} mock={mock} />
        </div>
      </div>
    </AppShell>
  );
}

/**
 * Profile never asks "When is your exam?" unprompted (that question belongs to the dashboard): no date reads
 * "Not set · Add exam date", as after Skip. A passed date still asks for the next one; a set date has Edit and, inside
 * it, Remove date.
 */
function profileExamState(state: ExamDateState): ExamDateState {
  return state.kind === "ask" ? { kind: "skipped" } : state;
}
