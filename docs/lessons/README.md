# Lessons

- `drafts/`: the lesson files. Their lesson text is not edited here once approved.
- `src/content/lessons/`: the lessons the app shows, copied **word for word** from these files
  (`src/content/lessons/lessons.test.ts` compares every string, and checks that the app's status, reviewer and review
  date match each file's). Only lessons with `status: "approved"` and a reviewer and date are ever shown to a student.
- `drill-drafts.md`: the neutral drill sets for the wave 1 lessons, **approved** by Asadbek on 2026-11-07. They are the
  drills of the three lesson files (version 2) and of the app, word for word (tested).

## Approved

| Lesson | File | Approved by | Date |
| --- | --- | --- | --- |
| L-T1 Answer every question (v2: neutral drill) | `drafts/L-T1-answer-every-question.md` | Asadbek | 2026-11-07 |
| L-T8 The picture is not the question (v2: neutral drill) | `drafts/L-T8-picture-is-not-the-question.md` | Asadbek | 2026-11-07 |
| L-T4 (B2) Answer, reason, example (v2: neutral drill) | `drafts/L-T4-answer-reason-example-B2.md` | Asadbek | 2026-11-07 |
