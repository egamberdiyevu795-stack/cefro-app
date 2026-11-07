# Lessons

- `drafts/`: the lesson files. Their lesson text is not edited here once approved.
- `src/content/lessons/`: the lessons the app shows, copied **word for word** from these files
  (`src/content/lessons/lessons.test.ts` compares every string, and checks that the app's status, reviewer and review
  date match each file's). Only lessons with `status: "approved"` and a reviewer and date are ever shown to a student.
- `drill-drafts.md`: neutral drill sets proposed for the wave 1 lessons. **Draft, not shown**: nothing in the app reads
  it until the owner approves it.

## Approved

| Lesson | File | Approved by | Date |
| --- | --- | --- | --- |
| L-T1 Answer every question | `drafts/L-T1-answer-every-question.md` | Asadbek | 2026-11-07 |
| L-T8 The picture is not the question | `drafts/L-T8-picture-is-not-the-question.md` | Asadbek | 2026-11-07 |
| L-T4 (B2) Answer, reason, example | `drafts/L-T4-answer-reason-example-B2.md` | Asadbek | 2026-11-07 |
