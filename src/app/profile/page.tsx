import type { Metadata } from "next";
import { connection } from "next/server";
import { DemoLabel } from "@/components/ds";
import { deletedItems } from "@/domain/account";
import { FEATURE_FLAGS } from "@/config/features";
import { addDays, examDateState, MAX_DAYS_AHEAD, todayIn, type ExamDateState } from "@/domain/exam-date";
import { ExamDate } from "@/features/dashboard/ExamDate";
import { isMockQuery } from "@/features/demo/demo-mode";
import { AccountCard, ConsentCard, DeleteCard, SignInCard } from "@/features/profile/sections";
import { parseConsentPreview, type ConsentRecord } from "@/domain/consent";
import { readOwnConsent } from "@/server/consent/consent";
import { asDemoTeacher, isDemoTeacherQuery, studentLinks } from "@/features/teacher/links";
import { MyClassesCard, TeacherLinkCard, type MembershipView } from "@/features/teacher/sections";
import { mockLink } from "@/features/demo/demo-mode";
import { DEMO_CLASS, DEMO_TEACHER } from "@/server/demo/demo-teacher";
import { teacherLive } from "@/server/teacher/release";
import { listMemberships, userRole } from "@/server/teacher/teacher-store";
import { currentLevel } from "@/features/profile/view-model";
import { AppShell } from "@/features/shell/AppShell";
import { readAccount, type AccountInfo } from "@/server/account/account-store";
import { listAttemptHistory } from "@/server/attempts/attempt-service";
import { assertServerConfigured } from "@/server/config/boot-check";
import { demoAccount, demoAttempts, demoExamDate } from "@/server/demo/demo-data";
import { readExamDate } from "@/server/exam-date/exam-date-store";
import { findCurrentUserId } from "@/server/identity/current-user";

export const metadata: Metadata = { title: "Account" };

/*
 * The Account page, opened directly by the Account tab (Profile and Settings merged, approved by Asadbek on
 * 2026-11-07; `/settings` redirects here). Top to bottom:
 *   (a) name (editable), email (shown), current level (latest scored Part 2 answer, never invented), member since,
 *       number of practice attempts;
 *   (b) the exam date (the dashboard's editor and rules);
 *   (c) Change password, then Sign out;
 *   (d) Delete my account, last, in its own section.
 * Only the caller's own data (`findCurrentUserId`, the History rule). A visitor without an account sees their browser's
 * attempts, level and exam date, then Sign in / Create account; no password or delete sections.
 *
 * `?mock=1`: the demo student (server/demo/demo-data.ts) through the same code. No configuration check, no cookie, no
 * database, no API call: nothing is saved or changed. "Demo mode. Changes are not saved."
 *
 * Teacher view (docs/teacher-plan.md): a student's "Your classes" (S3, grey "Join a class"); a teacher's quiet link to
 * Your classes on Home. Real accounts only once the Teacher view is on (parent consent); in mock mode always:
 * `&joined=DEMO42` shows the demo class after Share, `&as=teacher` is the demo teacher.
 *
 * Pilot consent (CONSENT_REQUIRED on): a read-only "Recording consent" section for a signed-in account, after the
 * account. Mock mode shows it only with `&consent=waiting|granted|withdrawn` (a made-up record).
 */
export default async function AccountPage(props: PageProps<"/profile">) {
  const query = await props.searchParams;
  await connection();
  const now = new Date();
  const mock = isMockQuery(query);

  let account: AccountInfo;
  let attempts;
  let stored;
  // Teacher view: null = not shown (the Teacher view is off for real accounts until parent consent exists).
  let classes: { role: "teacher" } | { role: "student"; memberships: MembershipView[] } | null = null;
  let consent: ConsentRecord | null = null;
  const demoTeacher = mock && isDemoTeacherQuery(query);
  if (mock) {
    account = demoTeacher ? { ...demoAccount(now), name: DEMO_TEACHER.name, email: "teacher@example.com" } : demoAccount(now);
    attempts = demoTeacher ? [] : await demoAttempts(now);
    stored = demoExamDate(now);
    consent = demoTeacher ? null : parseConsentPreview(typeof query.consent === "string" ? query.consent : undefined, now);
    classes = demoTeacher
      ? { role: "teacher" }
      : {
          role: "student",
          memberships:
            query.joined === DEMO_CLASS.joinCode
              ? [{ id: "demo-member", className: DEMO_CLASS.name, teacherName: DEMO_TEACHER.name, shownName: "Student", sharedAt: now.toISOString(), ended: false, needsUpgrade: query.legacy === "1" }]
              : [],
        };
  } else {
    assertServerConfigured();
    const userId = await findCurrentUserId();
    account = await readAccount(userId);
    attempts = userId ? await listAttemptHistory(userId) : [];
    stored = userId ? await readExamDate(userId) : { examDate: null, examDateSkippedAt: null };
    consent = account.kind === "registered" ? await readOwnConsent(userId) : null;
    if (userId && account.kind === "registered" && teacherLive()) {
      classes =
        (await userRole(userId)) === "teacher"
          ? { role: "teacher" }
          : { role: "student", memberships: (await listMemberships(userId)).map((m) => ({ ...m, ended: m.endedBy !== null })) };
    }
  }

  const today = todayIn(now);
  const signedIn = account.kind === "registered";
  return (
    <AppShell flags={FEATURE_FLAGS} account={mock ? "mock" : "real"} activeHref="/profile" demoTeacher={demoTeacher}>
      {mock && <DemoLabel variant="changes" className="mb-4 bg-card" />}
      <h1 className="mb-4 text-title font-medium tracking-[-0.01em] text-fg">Account</h1>
      <div className="mx-auto flex max-w-2xl flex-col gap-4 lg:mx-0">
        <AccountCard account={account} attempts={attempts.length} level={currentLevel(attempts)} mock={mock} />
        {consent && <ConsentCard record={consent} />}
        <ExamDate state={accountExamState(examDateState(stored, now))} today={today} max={addDays(today, MAX_DAYS_AHEAD)} variant="card" demo={mock} />
        {classes?.role === "teacher" && <TeacherLinkCard href={demoTeacher ? asDemoTeacher("/dashboard") : "/dashboard"} />}
        {classes?.role === "student" && (
          <MyClassesCard memberships={classes.memberships} joinHref={mockLink(studentLinks.join, mock)} accountHref={mockLink(studentLinks.account, mock)} demo={mock} />
        )}
        <SignInCard signedIn={signedIn} mock={mock} />
        {signedIn && <DeleteCard mock={mock} items={deletedItems(teacherLive())} />}
      </div>
    </AppShell>
  );
}

/**
 * The Account page never asks "When is your exam?" unprompted (that question belongs to the dashboard): no date reads
 * "Not set · Add exam date", as after Skip. A passed date still asks for the next one; a set date has Edit and, inside
 * it, Remove date.
 */
function accountExamState(state: ExamDateState): ExamDateState {
  return state.kind === "ask" ? { kind: "skipped" } : state;
}
