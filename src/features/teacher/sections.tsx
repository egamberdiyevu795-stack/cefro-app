import Link from "next/link";
import { Card, CardHeader, Icon, PillButton, StatRow, Thumb, cx, styles } from "@/components/ds";
import { NO_LONGER_IN_CLASS } from "@/domain/teacher/rules";
import { AttemptRow } from "@/features/history/sections";
import { formatDate } from "@/features/history/view-model";
import { ConfirmAction, JoinCodeCard } from "./actions";
import { countText, studentCountText, type ClassSummary, type CommonProblem, type StudentDetail, type StudentRow } from "./view-model";

/*
 * Teacher view sections (docs/teacher-plan.md, section 2), built only from components/ds and the design-system tokens.
 * Values come from view-model.ts. `href` builds a link for the mode (mock mode keeps ?mock=1).
 */

type Href = (path: string) => string;

/* ------------------------------------------------------------------------------------------------ T1 Your classes */

/** At the top of a teacher's Home: one row per class, and the page's one black button, "Create class". */
export function YourClassesCard({ classes, newClassHref, classHref, className }: { classes: readonly ClassSummary[]; newClassHref: string; classHref: (id: string) => string; className?: string }) {
  return (
    <Card aria-labelledby="classes-title" className={className} data-testid="your-classes">
      <CardHeader id="classes-title" title="Your classes" action={<PillButton href={newClassHref} icon="plus">Create class</PillButton>} />
      {classes.length === 0 ? (
        <p className="text-body text-fg-muted">No classes yet</p>
      ) : (
        <ul className="-my-1">
          {classes.map((c, i) => (
            <li key={c.id}>
              <Link href={classHref(c.id)} className={cx("-mx-2 flex items-center gap-3 rounded-tile px-2 py-2.5 transition-colors hover:bg-well", styles.FOCUS_RING)}>
                <Thumb tone={(((i % 4) + 1) as 1 | 2 | 3 | 4)} size={30}>
                  <Icon name="layers" size={14} />
                </Thumb>
                <span className="min-w-0 flex-1">
                  <span className="block text-body font-semibold text-fg sm:truncate">{c.name}</span>
                  <span className="block text-caption text-fg-muted">
                    {studentCountText(c.students)} · Last activity {c.lastActivity}
                  </span>
                </span>
                <Icon name="chevronDown" size={16} className="-rotate-90 text-fg-subtle" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------------------------------------- T3 Class overview */

export function ClassOverview({
  classId,
  name,
  joinCode,
  problems,
  students,
  href,
  demo,
}: {
  classId: string;
  name: string;
  joinCode: string;
  problems: readonly CommonProblem[];
  students: readonly StudentRow[];
  href: { student: (memberId: string) => string; lesson: (slug: string) => string; afterClose: string };
  demo: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.44fr)] lg:items-start">
      <h1 className="text-title font-medium tracking-[-0.01em] text-fg lg:col-span-2">{name}</h1>
      <Card aria-label="Join code" className="lg:col-start-2 lg:row-start-2">
        <JoinCodeCard code={joinCode} classId={classId} demo={demo} />
      </Card>
      <div className="flex flex-col gap-4 lg:col-start-1 lg:row-start-2 lg:row-span-2">
        <CommonProblemsCard problems={problems} lessonHref={href.lesson} />
        <StudentsCard students={students} studentHref={href.student} />
      </div>
      <div className="lg:col-start-2 lg:row-start-3">
        <ConfirmAction
          testId="close-class"
          label="Close class"
          title={`Close ${name}?`}
          text={
            <>
              <p>Every student leaves the class and you lose access to their attempts. The code stops working.</p>
              <p className="mt-1">Your levels are kept only as anonymous number pairs.</p>
            </>
          }
          confirmLabel="Close class"
          request={{ url: `/api/teacher/classes/${encodeURIComponent(classId)}/close`, method: "POST" }}
          then={href.afterClose}
          demo={demo}
          demoDone="Demo mode: the class would now be closed. Nothing was changed."
        />
      </div>
    </div>
  );
}

function CommonProblemsCard({ problems, lessonHref }: { problems: readonly CommonProblem[]; lessonHref: (slug: string) => string }) {
  return (
    <Card aria-labelledby="problems-title" data-testid="common-problems">
      <CardHeader id="problems-title" title="Most common problems" />
      {problems.length === 0 ? (
        <p className="text-body text-fg-muted">Problems appear here once a student&rsquo;s shared answer is scored.</p>
      ) : (
        <ol className="-my-1 divide-y divide-line">
          {problems.map((p) => (
            <li key={p.label} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-3">
              <span className="min-w-0">
                <span className="block text-body font-semibold text-fg">{p.label}</span>
                <span className="block text-label text-fg-muted">{countText(p)}</span>
              </span>
              {p.lesson && (
                <PillButton href={lessonHref(p.lesson.slug)} variant="quiet" size="sm" icon="book" label={`Lesson: ${p.lesson.title}`}>
                  Lesson
                </PillButton>
              )}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function StudentsCard({ students, studentHref }: { students: readonly StudentRow[]; studentHref: (memberId: string) => string }) {
  return (
    <Card aria-labelledby="students-title" data-testid="students">
      <CardHeader id="students-title" title="Students" action={<span className="text-label text-fg-muted">{studentCountText(students.length)}</span>} />
      {students.length === 0 ? (
        <p className="text-body text-fg-muted">No students yet. They appear here once they share with this class.</p>
      ) : (
        <ul className="-my-1 divide-y divide-line">
          {students.map((s, i) => (
            <li key={s.memberId}>
              <Link
                href={studentHref(s.memberId)}
                className={cx("-mx-2 flex items-start gap-3 rounded-tile px-2 py-3 transition-colors hover:bg-well", styles.FOCUS_RING)}
                data-testid="student-row"
              >
                <Thumb tone={(((i % 4) + 1) as 1 | 2 | 3 | 4)} size={30}>
                  <Icon name="user" size={14} />
                </Thumb>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-body font-semibold text-fg">{s.name}</span>
                    <span className="shrink-0 text-body font-medium text-fg">{s.level}</span>
                  </span>
                  <span className="mt-0.5 block text-label text-fg-muted">
                    {s.attempts} {s.attempts === 1 ? "attempt" : "attempts"} · Last practice {s.lastPractice}
                  </span>
                  <span className="mt-0.5 block text-label text-fg">
                    <span className="text-fg-muted">Biggest fix: </span>
                    {s.biggestFix}
                  </span>
                  <span className="mt-0.5 block text-label text-fg">
                    <span className="text-fg-muted">Retry goal: </span>
                    {s.retryGoal}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* --------------------------------------------------------------------------------------------------- T4 Student */

export function StudentView({
  detail,
  classId,
  memberId,
  latestHref,
  attemptHref,
  afterRemove,
  demo,
}: {
  detail: StudentDetail;
  classId: string;
  memberId: string;
  latestHref: string | null;
  attemptHref: Href;
  afterRemove: string;
  demo: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.44fr)] lg:items-start">
      <Card aria-labelledby="student-title" className="lg:col-span-2">
        <p className="text-caption text-fg-muted">Student</p>
        <h1 id="student-title" className="mt-1 text-title font-medium tracking-[-0.01em] text-fg">
          {detail.name}
        </h1>
        <p className="mt-3 text-caption text-fg-muted">Current level</p>
        <p className="text-stat font-light tracking-[-0.02em] text-fg" data-testid="student-level">
          {detail.level}
        </p>
        <p className="mt-1 text-caption text-fg-muted">From shared answers only</p>
        {latestHref && (
          <div className="mt-5">
            <PillButton href={latestHref} icon="play">
              Open latest attempt
            </PillButton>
          </div>
        )}
      </Card>
      <Card aria-labelledby="skills-title" className="lg:col-start-2">
        <CardHeader id="skills-title" title="Skills" />
        {detail.skills.length ? (
          <dl className="flex flex-col gap-2">
            {detail.skills.map((s) => (
              <StatRow key={s.name} label={s.name} value={s.level} />
            ))}
          </dl>
        ) : (
          <p className="text-body text-fg-muted">Skills appear once a shared answer is scored.</p>
        )}
      </Card>
      <Card aria-labelledby="attempts-title" className="lg:col-start-1 lg:row-start-2">
        <CardHeader id="attempts-title" title="Shared attempts" action={<span className="text-label text-fg-muted">{detail.rows.length}</span>} />
        {detail.rows.length ? (
          <ul className="-my-1">
            {detail.rows.map((row, i) => (
              <AttemptRow key={row.id} row={{ ...row, href: attemptHref(row.id) }} tone={(((i % 4) + 1) as 1 | 2 | 3 | 4)} />
            ))}
          </ul>
        ) : (
          <p className="text-body text-fg-muted">No shared attempts yet. Only answers made after joining are shared.</p>
        )}
      </Card>
      <div className="lg:col-start-1">
        <ConfirmAction
          testId="remove-student"
          label="Remove from class"
          title={`Remove ${detail.name}?`}
          text={
            <>
              <p>You lose access to their attempts. They see &ldquo;{NO_LONGER_IN_CLASS}&rdquo; on their Account page.</p>
              <p className="mt-1">Your levels are kept only as anonymous number pairs.</p>
            </>
          }
          confirmLabel="Remove"
          request={{ url: `/api/teacher/classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(memberId)}`, method: "DELETE" }}
          then={afterRemove}
          demo={demo}
          demoDone={`Demo mode: ${detail.name} would now be removed. Nothing was changed.`}
        />
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------------------- S3 My classes (Account) */

export interface MembershipView {
  id: string;
  className: string;
  teacherName: string;
  shownName: string;
  sharedAt: string;
  ended: boolean;
}

/**
 * The student's classes on the Account page: teacher, class, the name shown, "Sharing since 07.11.26", a quiet Leave
 * class (confirm card). Closed or removed: "You're no longer in this class." "Join a class" is grey: the Account page
 * keeps its own black button.
 */
export function MyClassesCard({ memberships, joinHref, accountHref, demo }: { memberships: readonly MembershipView[]; joinHref: string; accountHref: string; demo: boolean }) {
  return (
    <Card aria-labelledby="my-classes-title" data-testid="my-classes">
      <CardHeader id="my-classes-title" title="Your classes" />
      {memberships.length === 0 ? (
        <p className="text-body text-fg-muted">Share your practice with a teacher: enter the code they give you.</p>
      ) : (
        <ul className="-my-1 divide-y divide-line">
          {memberships.map((m) => (
            <li key={m.id} className="py-3" data-testid="membership">
              <p className="text-body font-semibold text-fg">
                {m.teacherName} · {m.className}
              </p>
              {m.ended ? (
                <p className="mt-0.5 text-body text-fg">{NO_LONGER_IN_CLASS}</p>
              ) : (
                <>
                  <p className="mt-0.5 text-label text-fg-muted">
                    Name shown: <span className="text-fg">{m.shownName}</span> · Sharing since {formatDate(m.sharedAt)}
                  </p>
                  <div className="mt-2">
                    <ConfirmAction
                      testId="leave-class"
                      label="Leave class"
                      title={`Leave ${m.className}?`}
                      text={
                        <>
                          <p>Your teacher loses access to everything.</p>
                          <p className="mt-1">We keep your teacher&rsquo;s level and ours as an anonymous number pair to improve scoring. It can&rsquo;t be linked to you.</p>
                        </>
                      }
                      confirmLabel="Leave class"
                      request={{ url: `/api/classes/${encodeURIComponent(m.id)}/leave`, method: "POST" }}
                      then={accountHref}
                      demo={demo}
                      demoDone={`Demo mode: you would now have left ${m.className}. Nothing was changed.`}
                    />
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 border-t border-line pt-4">
        <PillButton href={joinHref} variant="quiet" icon="plus">
          Join a class
        </PillButton>
      </div>
    </Card>
  );
}

/** A teacher's quiet link to Your classes on the Account page. */
export function TeacherLinkCard({ href }: { href: string }) {
  return (
    <Card aria-labelledby="teacher-title">
      <CardHeader id="teacher-title" title="Teaching" />
      <Link href={href} className={cx(styles.SMALL_ACTION, "min-h-9")} data-testid="your-classes-link">
        <Icon name="layers" size={14} />
        Your classes
      </Link>
    </Card>
  );
}
