# Lessons

- `drafts/`: the lesson files as written (AI first drafts, then reviewed). Their text is not edited here.
- `src/content/lessons/`: the lessons the app shows, copied **word for word** from these files
  (`src/content/lessons/lessons.test.ts` compares every string). Only lessons with `status: "approved"` and a reviewer
  and date are ever shown to a student.

## Approved

| Lesson | File | Approved by | Date |
| --- | --- | --- | --- |
| L-T1 Answer every question | `drafts/L-T1-answer-every-question.md` | owner | 2026-11-07 |
| L-T8 The picture is not the question | `drafts/L-T8-picture-is-not-the-question.md` | owner | 2026-11-07 |
| L-T4 (B2) Answer, reason, example | `drafts/L-T4-answer-reason-example-B2.md` | owner | 2026-11-07 |

The files' own "Status" / "Reviewed by" fields still read draft / empty: they were left untouched so the text stays
exactly as approved. This table and the lesson's `status`, `reviewedBy` and `reviewedAt` in code are the record.
