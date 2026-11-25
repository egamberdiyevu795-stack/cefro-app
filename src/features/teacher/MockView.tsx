import Link from "next/link";
import { Card, CardHeader, Icon, cx, styles } from "@/components/ds";
import { examPartLabel } from "@/domain/speaking/exam-part";
import { PART_NAMES } from "@/features/dashboard/progress";
import { levelOfBand } from "@/features/history/view-model";
import { TeacherPlayer } from "@/features/result/TeacherPlayer";
import { TranscriptWithFixes } from "@/features/result/TranscriptWithFixes";
import { MockLevelView, YourView } from "./actions";
import { ReviewProgress, ReviewProvider } from "./ReviewProgress";
import { partStatusText, teacherMockHeader, type TeacherMockPartView, type TeacherMockView } from "./mock-view";
import { appVerdictText } from "./view-model";

/**
 * T6 Student's mock (docs/v1-plan.md section 5): the estimated level, the date and Finished / Not finished, how many
 * parts are rated ("2 of 4 parts rated", live) and the optional level for the whole mock, beside (desktop) or above
 * (phones) four part cards, each with the player, the transcript (tap a sentence for its better version), CEFRO's band
 * and, in grey, Agree / Choose level for that part. NO black button on this page.
 * Built from the teacher's own data only (`TeacherMockView`): no email, no account name.
 */
export function TeacherMock({ mock, ratingUrl, mockRatingUrl, demo }: { mock: TeacherMockView; ratingUrl: (attemptId: string) => string; mockRatingUrl: string; demo: boolean }) {
  const header = teacherMockHeader(mock);
  const rateable = mock.parts.filter((p) => p.state === "scored" && p.band && p.attemptId);
  return (
    <ReviewProvider initiallyRated={rateable.filter((p) => p.rating).map((p) => partViewId(p.part))}>
    {/* Desktop: the parts on the left, the summary (level, review progress, level for the whole mock) beside them;
        phones: one column, summary first. */}
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.44fr)] lg:items-start" data-testid="teacher-mock" data-status={mock.status}>
      <div className="flex flex-col gap-4 lg:col-start-2 lg:row-start-1">
      <Card aria-labelledby="mock-title" data-testid="teacher-mock-header">
        <p className="text-caption text-fg-muted">{mock.studentName}</p>
        <h1 id="mock-title" className="mt-1 text-title font-medium tracking-[-0.01em] text-fg">
          {header.title}
        </h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-body text-fg">
          <span className="inline-flex items-center gap-1.5 font-semibold" data-testid="mock-status">
            <Icon name={mock.status === "finished" ? "check" : "clock"} size={14} className="text-fg-subtle" />
            {header.statusText}
          </span>
          <span className="text-fg-muted">{header.date}</span>
          {header.placeText && (
            <span className="text-fg-muted" data-testid="mock-place">
              {header.placeText}
            </span>
          )}
        </p>
        {header.note && <p className="mt-2 text-label text-fg-muted">{header.note}</p>}
        <p className="mt-4 text-caption text-fg-muted">Estimated speaking level (CEFRO)</p>
        <p className={header.estimate ? "text-stat font-light tracking-[-0.03em] text-fg" : "text-lead font-medium text-fg"} data-testid="mock-estimate">
          {header.estimate ?? header.estimateText}
        </p>
        {header.scoreText && (
          <p className="text-body font-medium text-fg" data-testid="mock-score">
            {header.scoreText}
          </p>
        )}
        {header.teacherText && (
          <p className="mt-1 text-body text-fg" data-testid="mock-teacher-score">
            {header.teacherText}
          </p>
        )}
        <p className="mt-1 text-label text-fg-muted">{header.line}</p>
        {header.ratingText && (
          <p className="mt-2 text-body font-semibold text-fg" data-testid="mock-header-rating">
            {header.ratingText}
          </p>
        )}
        <div className="mt-4 border-t border-line pt-4">
          <ReviewProgress total={rateable.length} />
        </div>
      </Card>
      <MockLevelView estimate={header.estimate} initial={mock.rating} url={mockRatingUrl} demo={demo} />
      </div>
      <div className="flex flex-col gap-4 lg:col-start-1 lg:row-start-1">
        {mock.parts.map((part) => (
          <PartCard key={part.part} part={part} who={mock.studentName} ratingUrl={part.attemptId ? ratingUrl(part.attemptId) : null} demo={demo} />
        ))}
      </div>
    </div>
    </ReviewProvider>
  );
}

/** The id of a part's "Your view" (also how the review progress knows which parts are rated). */
function partViewId(part: string): string {
  return `part-${part.replace(".", "-")}-view`;
}

function PartCard({ part, who, ratingUrl, demo }: { part: TeacherMockPartView; who: string; ratingUrl: string | null; demo: boolean }) {
  const id = `part-${part.part.replace(".", "-")}`;
  const status = partStatusText(part);
  return (
    <Card aria-labelledby={`${id}-title`} data-testid="mock-part" data-part={part.part} data-state={part.state}>
      <CardHeader
        id={`${id}-title`}
        title={`${examPartLabel(part.part)} · ${PART_NAMES[part.part]}`}
        action={
          part.band ? (
            <span className="text-right" data-testid="part-cefro">
              <span className="block text-body font-semibold text-fg">{levelOfBand(part.band.label)}</span>
              <span className="block whitespace-nowrap text-caption text-fg-muted">
                Band {part.band.band} · {part.band.label}
              </span>
            </span>
          ) : (
            <span className="text-label text-fg" data-testid="part-status">
              {status}
            </span>
          )
        }
      />
      {part.taskTitle && <p className="-mt-2 mb-3 text-caption text-fg-muted">{part.taskTitle}</p>}
      {part.state === "not_done" ? (
        <p className="text-body text-fg-muted">This part was not done.</p>
      ) : (
        <>
          {part.listen && <TeacherPlayer listen={part.listen} who={`${who} · ${examPartLabel(part.part)}`} className="mb-4" />}
          {part.transcript ? (
            part.fixes ? (
              <TranscriptWithFixes view={part.fixes} />
            ) : (
              <>
                <p className="text-caption text-fg-muted">Transcript</p>
                <p className="mt-1 text-body text-fg">{part.transcript}</p>
              </>
            )
          ) : (
            <p className="text-body text-fg-muted">{part.state === "scoring" ? "The transcript appears when it is written." : "No transcript."}</p>
          )}
          {part.state === "scored" && part.band && ratingUrl ? (
            <div className="mt-5">
              <YourView
                compact
                idPrefix={partViewId(part.part)}
                verdict={appVerdictText(part.part, part.band.band, part.band.label)}
                bands={part.bands}
                initial={part.rating}
                url={ratingUrl}
                demo={demo}
              />
            </div>
          ) : (
            <p className="mt-4 border-t border-line pt-3 text-label text-fg-muted">There is no band to rate for this part yet.</p>
          )}
        </>
      )}
    </Card>
  );
}

/** T4's quiet link back to the student from a mock. */
export function BackToStudent({ href, name, className }: { href: string; name: string; className?: string }) {
  return (
    <Link href={href} className={cx(styles.SMALL_ACTION, "min-h-9", className)}>
      {name}
    </Link>
  );
}
