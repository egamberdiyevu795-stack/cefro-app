# CEFRO design system

Every new page (dashboard, feedback screen, lessons, tests) is built only from these tokens and components.
Tokens live in one file: `src/app/design-system.css` (a Tailwind v4 `@theme`, so each token is also a utility class,
e.g. `--color-card` → `bg-card`). Components live in `src/components/ds/`. The first page built on it is `/dashboard`.

The signed-out pages (home, sign in, Create account) are on the design system: see [Signed-out pages](#signed-out-pages-home-sign-in-create-account).
The task list (`/practice`) is on the design system too (see [Task list](#task-list-practice)), so no page uses the
earlier tokens in `globals.css` any more. The practice page is fully on the design system: every step, the
result page for real attempts, the retry comparison and the error screens.

## Merge order (read before merging)

See **[docs/merge-order.md](merge-order.md)**: the safe order for every open branch, what each contains, and the one
rebase needed (`part1-player`). (An earlier note here called `claude/friendly-darwin-l73xx9` PR #5's branch: PR #5 is
`claude/compassionate-johnson-odu08r`. And `part1-player`'s dev page no longer needs to move into `(site)`.)
The `(site)` route group is gone since `claude/practice-list`: its last page, the task list, moved to
`src/app/practice/page.tsx` (same URL) with the app frame, and its header (the old Account menu) was deleted.

### Files the route-group move touched

The existing pages moved into the `(site)` route group so `/dashboard` can have its own shell. URLs did not change and
the moved files are byte-for-byte identical (git shows them as 100% renames).

| Change | File |
| --- | --- |
| moved | `src/app/page.tsx` → `src/app/(site)/page.tsx` |
| moved | `src/app/login/page.tsx` → `src/app/(site)/login/page.tsx` |
| moved | `src/app/register/page.tsx` → `src/app/(site)/register/page.tsx` |
| moved | `src/app/practice/speaking/[taskId]/page.tsx` → `src/app/(site)/practice/speaking/[taskId]/page.tsx` (moved back out of `(site)` by the practice flow, see below) |
| added | `src/app/(site)/layout.tsx` (the skip link, header and `<main>` that used to be in the root layout) |
| edited | `src/app/layout.tsx` (now only `<html>`, `<body>` and fonts; adds Inter) |
| edited | `src/app/globals.css` (imports `design-system.css`; its own tokens unchanged) |

API routes (`src/app/api/**`) did not move.

## One primary action per screen

Only one near-black (`primary`) control per screen, the navigation included: the current nav item is a **grey** square
(`NAV_ITEM_ACTIVE`, approved by Asadbek on 2026-11-07), never black, on every page; a browser test checks every main page
in mock mode at 390 px. Every other action uses the grey `quiet` pill (or `light` on a
`well` tile). Dashboard: returning = "Practise next · Start" (Biggest fix "Start retry" is grey); first visit = the
welcome card's "Start your first practice" (it goes to the recommended part, Part 2); attempts but none scored = the
same card's "Start practice". All part tiles use the white tile pill. The exam date's Save is grey; Edit, Add exam
date, Skip, Cancel and Remove date are small text actions with a 36 px tap area. Practice brief: "Start
preparation"; "Check microphone" above it is grey. Signed-out home: "Start practising" ("See a demo result" is grey); sign in: "Sign in"; Create account: "Create account".
Task list: none (the rows are the page; the brief has the black "Start preparation"). Account page: "Go to Part 2" / "Practise Part 2"; Change password,
Sign out and Delete my account are grey (a destructive action is never black).

## Signed-out pages (home, sign in, Create account)

Home (`/`), sign in (`/login`) and Create account (`/register`) are built only from `components/ds` and the tokens
above (`src/app/(entry)/`, `src/features/entry/`), so a theme change restyles them. They have **no header menu and no
navigation tabs**, on `bg-page`, the CEFRO wordmark on top (`EntryFrame`). Phones: one column, 16 px gutters. From
768 px the header row spans the page (max 1120 px: wordmark left, "Sign in" right) and the content is centred under it:
the forms (sign in, Create account, password reset; `width="narrow"`) stay one column of at most 448 px, a form is
easier to fill in narrow; home (`width="wide"`) is at most 1024 px and two columns from 1024 px (left: the pitch, the
`text-display` heading and "Start practising"; right: the three steps and the exam parts; "Built by" last, under
both). The `(entry)` layout runs the configuration check (as the `(site)` one did), except in mock mode.

- **Home** (redesigned on `claude/landing`, `docs/growth-plan.md` phase 1; it speaks about the whole exam, never only
  one part): top row with the wordmark left and a small grey "Sign in" right (`EntryHeaderLink`: `fg-muted`, 5.26:1
  on the page, underlined, 44 px tap height); the small line "UZBMB multilevel speaking" (`text-label`, muted); the
  heading "Know exactly what to fix before your speaking exam"; the line "Answer exam-style questions out loud, see
  your own words quoted, fix one thing and try again." (`text-lead`, muted); a card with the black **"Start
  practising"** (`/register`) and the grey "See a demo result" (`/result?demo=demo-5&mock=1`: the real result page
  with a demo result from the existing mock evaluator, always in mock mode); a card with three steps, each with an
  icon in a `well` circle ("Speak like in the exam" / "Exam-style questions, pictures and timing."; "See your own
  words quoted" / "What worked and what to improve."; "Fix one thing, then retry" / "See whether it worked."; icons
  `mic`, `quote` (new), `retry`); then which exam parts are open (`examStatus` in `features/entry/content.ts`).
  The actions sit on a card because the grey pill would vanish on the grey page. No numbers, ratings, testimonials,
  "free", Passed/Failed or age claims. `?deleted=1` (after Delete my account): "Your account and all your data were
  deleted." on top. A **signed-in** visitor is sent to `/dashboard` (`isSignedIn`: no session cookie = signed out,
  without touching the database).
- **Exam parts on home:** read from `PART_LIVE` (`src/config/features.ts`, the dashboard's switches), so it can never
  be wrong. A small `StatRow` list: "Part 1 · A1–B1", "Part 2 · B2", "Part 3 · C1", each "Open" or "Coming soon"
  (word, never colour). Part 1 is "Open" only when both 1.1 and 1.2 are live. When all are live: the single line
  "All three parts are open." and no "Coming soon" anywhere. Today: Part 2 Open, Parts 1 and 3 Coming soon. This list
  is the only place on these three pages that names a part.
- **Sign in:** "Welcome back", email, password, the black **"Sign in"**, "New here? Create account".
- **Create account:** "Save your results", the line "Your answers, feedback and progress stay in your account, so you
  can see if you improve.", **email and password only** (no name field: the account starts with **no name**, never
  one made from the email, and the student sets it on the Account page), "At least 8 characters.", the black
  **"Create account"**, "Have an account? Sign in". The server's name rules still hold for any sign-up request that
  sends a name (1–50 characters after trimming, not an email address).
- **Unchanged behaviour:** the forms are `method="post"`, the submit stays disabled until the page is ready, the
  sign-in / sign-up limits and the trusted-IP rule are the API's (untouched), `?next=` (a path on this site only) is
  where the student goes after signing in, and the switch links keep it.
- **Text links** ("Sign in", "Create account") are dark and underlined (never colour alone), with a 44 px tap height.
- **Mock mode** (`/?mock=1`, `/login?mock=1`, `/register?mock=1`): nobody is looked up, the links keep `?mock=1`, the
  forms show `DemoLabel variant="entry"` ("Demo mode. Nothing you enter here is sent.") and submitting sends nothing.
  These are the addresses to look at on a Preview with no variables.
- **Checks:** `src/features/entry/entry-pages.test.ts` (wording, one black button, no text under 11 px, no old tokens,
  no menu or tabs, the signed-in redirect, `?next=`, the exam-parts list with the switches only Part 2 / all / none
  live and every combination, no part named outside it), `mock-pages.test.ts` (the three in mock mode touch no cookie,
  identity or database), `e2e/entry-pages.spec.ts` (at 390 px, real and mock: one black control, no text under 11 px,
  AA contrast of every visible text, no horizontal scroll; "See a demo result" keeps `?mock=1`; the list follows
  `PART_LIVE`; no name at sign-up and the server's name rule; signed in → dashboard), `e2e/auth.spec.ts` (unchanged journeys; the sign-in pages have no Account menu now, so their
  state is read from `/api/account/me`).
- **Laptop size and screenshots:** the 390 px audits of `e2e/entry-pages.spec.ts` also run at 1440 px (one black control,
  no text under 11 px, AA contrast, no horizontal scroll, one centred column (at most 448 px; home on a laptop: wider, at
  most 1024 px, two columns, the header wider than the content), no menu or tabs; the
  "Built by" line is last and 11 px or more at both sizes), and a test reads the three pages for any price, "free" or
  cost wording. Screenshots of the real pages (mock providers, throwaway database):
  `docs/design-system/entry-{home,sign-in,create-account}-{desktop,phone}.png`. Retake them with
  `node scripts/screenshots/entry.mjs` (under a minute; `--out`, `--port`; same safeguards as the dashboard script).

## Task list (`/practice`)

The Practice tab. Built only from `components/ds` and the tokens (`src/app/practice/page.tsx`,
`src/features/task-list/TaskList.tsx`), in the app frame (`AppShell`: rail on desktop, bottom bar on phones, Practice
as the current grey square, back link to the dashboard). One column, max 672 px, like Lessons.

- **Top to bottom:** the demo label in mock mode; the heading "Practice" and one muted line ("Choose a task. Speak
  under exam timing, see your own words quoted, fix one thing and try again."); then **one card per exam part, all
  four, in exam order** (1.1, 1.2, 2, 3; `claude/project-thread-e59hcb`). Each card is the part's anchor (`id="part-1-1"`,
  `part-1-2`, `part-2`, `part-3`; the dashboard's Part 2 tile and the Account page's "Go to Part 2" open `#part-2`):
  title ("Part 2 · Long turn"), the target level in a grey pill on the right (A2, B1, B2, C1), one line on what the
  part asks, then **the part's timing, once** (`clock` glyph, `text-label`): "3 questions · 30 s each" (1.1),
  "3 questions · 45 s for the first, 30 s for the others" (1.2), "1 min to prepare · 2 min to speak" (2 and 3).
- **Parts that are not live** (`PART_LIVE`): the line "**Coming soon.**" (`data-testid="part-status"`, text, never a
  control). Real page: no task rows (their pages are a 404). Mock mode: "Coming soon. You can try the demo below; it is
  not scored." and the tasks, opening their mock pages (Part 1: the question-by-question flow, which keeps the consent
  lock; Part 3: the Part 3 demo).
- **Each task** is one row and one link to its brief: a `mic` glyph in a `well` circle, the title (`text-body`,
  semibold), "Practised dd.mm.yy" under it once the student has answered it (`text-caption`, muted; nothing before),
  and a chevron. The timing is no longer repeated on every row. Rows are 56 px tall.
- **One tag, from the student's own history:** a grey pill on the task the dashboard's Practise next picks
  (`practiseNext`: an unmet goal first, then a task never practised, then the one practised least recently). "Start
  here" before any attempt (the recommended first task, "Advice from someone"), "Try next" after. Live parts only.
  No label or order claims how often a task comes up in the exam: there is no such data.
- **The "Full mock exam" card** sits between the heading and the part cards and holds **the page's one black button**
  (`MockExamCard`, `features/full-mock/screens.tsx`): "Start mock exam" (all four parts live), "Continue your mock" (one is in
  progress), "Try the demo mock" (mock mode, keeps `?mock=1`), or, before the real mock is open, only the text "**Coming
  soon.**" with no button. Choosing a single task stays plain rows (as on Lessons); the brief's "Start preparation" is the next
  black control. No price, "free", rating or level claims.
- **Unchanged behaviour:** same URL, same 7 Part 2 tasks in the same order, same links (`practiceHref`); the consent lock is
  on the brief (a locked student still sees the list and opens the locked brief). The real page checks the server
  configuration on every request (it used to come from the `(site)` layout). `?mock=1`: no check, the demo account,
  the demo label ("Demo mode. Your answer won't be scored."), every link keeps `?mock=1`. `?flags=off`: the frame with
  every flag off (no History tab).
- **Checks:** `content/speaking/part2-tasks.test.ts` (7 tasks in order under `#part-2`, timing line, demo label only in
  mock mode), `features/demo/mock-pages.test.ts` (mock mode: frame, Practice tab current, no black button, no text
  under 11 px, mock links only; real: the configuration check), `e2e/mock-mode.spec.ts` (at 390 px: no horizontal
  scroll, no text under 11 px, at most one black control, grey current tab), `e2e/no-dead-controls.spec.ts`,
  `e2e/auth.spec.ts` (Journey A starts here and reads the Account tab).
- Screenshots: `docs/design-system/task-list-{desktop,phone}.png` (mock mode).

## Navigation: five tabs

Rail on desktop, bottom bar on phones, the same five tabs in this order: **Home** (`/dashboard`), **Practice** (`/practice`, the task list; it was `/` until the signed-out home page),
**Lessons** (`/lessons`, the list of approved lessons), **History** (`/history`, flag `history`), **Account** (`/profile`). The
Account tab is a plain link (`AccountTab`), no menu, always shown; it carries `data-testid="account-status"` and
`data-state` (signed in or not). There is no Settings (gear) tab: Profile and Settings were merged into the Account
page (approved by Asadbek, 2026-11-07), and `/settings` redirects to `/profile`, keeping `?mock=1`. The current tab is
the grey square. In mock mode every tab keeps `?mock=1`.

## Feature flags

**No control that does nothing** (launch cleanup, 2026-11-08). The designed-but-unbuilt "Coming soon" controls are
gone in every mode, with their flags and the `ComingSoon` components: notifications (bell), search, the Mock exam link,
the "Last 30 days" filter, the attempt row menu (Delete, Report a wrong score) and the result page's placeholder "Play
recording". The Lessons tab is a real link. A new unbuilt feature is not shown until it works. Browser test:
`e2e/no-dead-controls.spec.ts` (no disabled control once the page is ready, every button does something when tapped,
every link opens a page, no "Coming soon" except the exam-part status).

Two flags remain, both for built features (both on): `history` (the sidebar item and "See all" are real links to
`/history`; off: not rendered and `/history` is a 404) and `examCountdown` (the real exam date: question, countdown,
Edit, Add exam date; off: not rendered and Practise next takes the full row).

- **Flag off:** the element is not rendered. Neighbours fill the space (e.g. "Practise next" takes the full row when
  the countdown is off).
- **Exam parts are live or not** (`PART_LIVE`, in the same file): one switch per part. On: the tile says "Start"
  ("Practise" once tried) and links to the part's tasks. Off: "Coming soon", no link. All four tiles are always shown.
  Part 2 is live; 1.1, 1.2 and 3 are not. These are release switches, not preview flags: `?flags=off` leaves them as they
  are, and a part goes live only once it has tasks (checked by `progress.test.ts`).
- Preview with every flag off: `/dashboard?flags=off`. Turn flags off before a page ships; delete a flag when its
  feature is real.

## Dashboard (real data)

Everything on `/dashboard` about the student comes from their own attempts (`listAttemptHistory`, the same owner rule
as History and the result page) and their exam date. Only the first visit's wording and the navigation are fixed. Every number is computed by pure, unit-tested functions in
`features/dashboard/progress.ts` (and `domain/exam-date.ts`); the page only loads data and lays out cards.

"Scored" = a completed Multilevel result that is a rating: not "too short to rate", not old-method, not still being
scored, not failed.

- **First visit** = no attempts at all: "Welcome to CEFRO", "Find your level", the black "Start your first practice"
  (Part 2), "When is your exam?"*, then the part tiles (Part 2 "Recommended"). No level, chart or list.
- **Attempts, none scored yet** (all still scoring, failed or too short to rate): not the first visit. The same card
  says "Welcome back", "Your level and skills appear here once an answer is scored", and the black **"Start practice"**;
  then **Recent attempts** (with "Scoring…" / "Not scored"), then the part tiles. Level, skills and biggest fix stay
  hidden until an answer is scored (`dashboardView` in `progress.ts`).
- **Current level and Skills by level:** per skill, the **middle value** of the last 3 scored answers (of 2, the mean
  of the two rounded as the scorer rounds: an exact .5 goes down; an answer that did not assess a skill, e.g.
  pronunciation without audio, is left out for that skill only; never assessed = "Not assessed" on the radar). The
  overall level is computed from those skill levels exactly as the scorer computes an answer's language level
  (`bestFitLevel`). Under it: "Based on your last 3 answers" / "your last 2 answers" / "your last answer". The target
  is Part 2's rubric target (B2).
- **"x of 4 skills at B2":** the same skill levels; skills at or above the target out of the assessed ones (5 when
  pronunciation was assessed).
- **"Up from …"** (lime): the level of the 3 scored answers before those, computed the same way, when it is lower.
  Hidden with fewer than 3 earlier scored answers, and when the level did not go up.
- **Stats:** attempts this month, parts practised (of 4), recorded speaking time this month (months in Uzbekistan time).
- **Biggest fix:** the latest scored answer's biggest fix, the same content as its result page (label, quote, "Try
  instead" / "Next step"), and the grey "Start retry" (a retry of that answer, with its goal). **"Still in X of your
  last 4 answers"** counts, among the last 4 scored answers, those with the same problem: the same skill below the
  target; the same question of the same task not answered on topic; or (own words) a memorised / off-question answer.
  Shown only when the latest answer itself still has the problem and there are at least 2 answers.
- **Practise next** (the black "Start"): (1) the latest attempt is a retry that was not scored (failed, too short)
  → "Finish your goal": that retry again; (2) the latest scored answer is a retry whose goal is "Not yet" (or partly
  there) → "Your goal isn't met yet": that retry again, with the same goal (`?retry=<the original attempt>`), the goal
  shown on the card; (3) otherwise the task practised least recently ("Not practised yet" first, else "Last practised
  04.11.26"). The mocked "A skill you learned" task and its `/dashboard/task/…` route are gone. A retry's goal is shown
  in full on every screen size (no line clamp).
- **Exam parts:** the latest scored band per part with its label, "Practise"; a part with nothing scored: "No band",
  "Not tried yet", "Start". A part with tasks opens its section of the task list (Part 2: `/practice#part-2`, where the
  student picks one of the 7 tasks), when the part is live (`PART_LIVE`). A part not live yet (1.1, 1.2, 3) has **no
  link**: its tile says "Coming soon". All four tiles are always shown.
- **Recent attempts:** the History rows (latest 4), no row menu (removed at launch; it used to be hidden on phones, where it squeezed the
  task name onto two lines.
- **Phone order:** Practise next, exam date*, progress, biggest fix, radar, recent attempts, exam parts.
- **Account** (with Log out) is always in the nav, whatever the flags, now the real account (`source="real"`).
- `?flags=off` still previews every flag off. The `?state=` switch and `DASHBOARD_STATE` are gone (the state follows
  the data).

\* flag `examCountdown`.

### Exam date

- Stored per user: `users.exam_date` ("YYYY-MM-DD", a day in Uzbekistan) and `users.exam_date_skipped_at`
  (migration `0005_exam_date`, two nullable columns). Saved through `PUT /api/account/exam-date` (`{ date }`,
  `{ skip: true }` or `{ remove: true }`), always for the caller (signed-in account or the browser's anonymous identity). A date must be today
  or later, within two years; anything else is a 400 with a plain message. An anonymous visitor's date (or Skip) moves
  to their account when they sign up, unless the account already has one.
- **No date:** "When is your exam?" with a date picker, the grey "Save" and "Skip" (on the first visit inside the
  welcome card; on the returning dashboard in the countdown's place). Skip is remembered: the question is not asked
  again; saving a date later clears it.
- **After Skip (or Remove date):** "Your exam · Not set" and a small secondary **"Add exam date"** in the countdown's
  place. It opens the same picker, with Cancel instead of Skip.
- **Date set:** "Your exam · in 23 days · 28.11.26" ("in 1 day", "today") with "Edit" (the same picker, with Cancel and,
  on its own line, **"Remove date"**: the date is cleared and the card goes back to "Add exam date").
- **Past date:** the countdown is hidden and the student is asked "When is your next exam?" ("Your exam date,
  01.11.26, has passed.").
- **Until the page is ready** (its scripts have run), every exam-date control is disabled. On a slow connection the
  HTML arrives first: a date picked then stayed on screen but never reached React's state ("Choose a date." under a
  visible date), and Save tapped then was a plain form submit that reloaded the page and lost the date
  (`useHydrated` in `ExamDate.tsx`).
- Days are counted in Uzbekistan's calendar, so the countdown is the same wherever the device is.
- The date field's border is `fg-subtle` (3.64:1 on the card: an input boundary needs 3:1).

### Checks and screenshots

- `features/dashboard/progress.test.ts` (middle value, the scorer's rounding, last 3 only, what counts as scored,
  "x of 4", "Up from", stats, biggest fix and "Still in", every Practise next case, part tiles and their flags, which
  dashboard), `features/dashboard/sections.test.ts` (Add exam date, Remove date only on Edit, 36 px text actions, the
  full goal, "Start practice", Coming soon tiles without a link), `domain/exam-date.test.ts`,
  `app/api/cross-user.test.ts` (exam date per user, validation, Skip, Remove date, carried over on sign-up),
  `server/db/migrations.test.ts` (0005 is additive), `e2e/dashboard.spec.ts` (new student; Skip → Add exam date →
  Edit → Remove date; a passed date asks "When is your next exam?"; a slow connection: the picker and Save stay disabled
  until the page is ready, then the date picked is the date saved; attempts not scored yet; 1 then 3 answers with
  "Still in"; another browser sees nothing; at 390 px on each: no horizontal scroll, no text under 11 px, one black
  button). The passed date and the failed attempt are set in the run's database (`e2e/db.ts`): the app never saves them.
  `e2e/db.ts` opens only an existing `data/e2e/<run id>.db` file and refuses anything else (`test/e2e-db-guard.test.ts`).
- Screenshots (1440 px and 390 px), taken from the real app (mock providers, a fresh database): `docs/design-system/dashboard-{first-visit,not-scored-yet,one-answer,normal,exam-date,exam-skipped,exam-passed,flags-off}-{desktop,phone}.png`.
  `not-scored-yet` = one failed attempt; `normal` = five answers on four tasks with a retry, no exam date yet;
  `exam-date` = the same with a date set; `exam-skipped` = after Remove date; `exam-passed` = a date that has passed.
  Part 1.1, 1.2 and 3 show "Coming soon". Audited in the browser: no horizontal scroll, smallest text 11 px, exactly
  one black button on each.
- **Retake them:** `node scripts/screenshots/dashboard.mjs` (about 2 minutes; `--out <dir>`, `--port <n>`). It starts
  its own `next dev` with the **mock** transcription and evaluation providers (no audio assessment, API keys not passed
  on) on a throwaway database under `data/screenshots/`, records answers with Chromium's fake microphone, and writes
  the PNGs into `docs/design-system/`. It refuses to start if an `.env` file sets `TURSO_*`, stops if a result was not
  scored by the mock evaluator, and fails a shot that has horizontal scroll, text under 11 px or not exactly one black
  button. It uses port 3200 unless `--port` says otherwise.

## Levels and bands

- An overall **level** is a CEFR level (Below B1, B1, B2, Above B2). The top of the dashboard shows only the level and
  the target ("B1 · target B2"), and a measurable goal ("2 of 4 skills at B2": assessed skills at B2 or above; a
  skill that was not assessed is not counted). Never a band there.
- A **band** (0–5) belongs to one exam part, and each part has its own band table (Part 2: 3 = Lower B2,
  4 = Higher B2; Part 1.2: 3 = Lower B1, 4 = Higher B1). So a band is always shown with its part and its label
  ("Part 2 · Band 2 · Higher B1") and only in the Exam parts tiles. Lists show the level of each attempt as
  the main value. There is no Passed/Failed; the only status is "Scoring…" while an answer is being processed.
- The dashboard's level is checked against the real Part 2 scorer by `src/features/dashboard/progress.test.ts`.
  Part 3 has no band table yet, so it shows no band.

## Rules

- No colours beyond the tokens below. No new hues (one exception, `mark`: the amber underline under a mistake); status is shown by word and glyph, never by colour.
- No gradients, except the soft one inside the radar chart.
- One shadow (`shadow-card`). Nothing heavier.
- No emojis. Icons come from `components/ds/Icon.tsx`.
- Photos and avatars are neutral blocks (`bg-block-1…4`) until real images exist.
- When unsure, choose the quieter option: grey over colour, regular over bold, less over more.

## Colour

| Token | Value | Utility | Used for |
| --- | --- | --- | --- |
| `--color-page` | `#e9e9ec` | `bg-page` | Behind everything (the outermost grey). |
| `--color-shell` | `#f4f4f5` | `bg-shell` | The large rounded frame that holds the app on desktop. |
| `--color-card` | `#fcfcfc` | `bg-card` | Cards; the phone bottom bar; halo behind small chart text. |
| `--color-well` | `#ececee` | `bg-well` | Quiet fills inside a card: goal pill, quiet button, progress-bar track, icon-button hover. |
| `--color-line` | `#e7e7e9` | `border-line`, `bg-line` | Thin dividers (card header, stat-row divider, top-bar divider), radar grid. |
| `--color-fg` | `#151517` | `text-fg` | Titles, values, list names, body. |
| `--color-fg-muted` | `#5e5f64` | `text-fg-muted` | Labels ("Attempts this month"), secondary cells, placeholders, "See all". |
| `--color-fg-subtle` | `#838489` | `text-fg-subtle` | Icons only (inactive sidebar, status glyphs, clock), radar axis that was not assessed. Not for text. |
| `--color-primary` | `#151517` | `bg-primary` | Primary pill button, active sidebar square, goal check square. |
| `--color-on-primary` | `#ffffff` | `text-on-primary` | Text and glyphs on `primary` and on `block-*`. |
| `--color-accent` | `#1f3be8` | `bg-accent`, `border-accent` | The only hue: radar outline and dots, progress-bar fill, quote rule, focus ring. |
| `--color-radar-core` | `#2f7bff` | — | Radar fill gradient, centre. |
| `--color-radar-edge` | `#d9ecff` | — | Radar fill gradient, edge. |
| `--color-mark` | `#b45309` | `decoration-mark` | Amber underline under a mistake in the transcript. A line only: never a fill, never text, never red. The one colour added after the palette was closed (v1-plan 3.3 asks for "amber, not red"). |
| `--color-lime` | `#c8f26c` | `bg-lime` | Positive-change label only ("+1 band"). |
| `--color-on-lime` | `#263409` | `text-on-lime` | Text on the lime label. |
| `--color-block-1…4` | `#737479` … `#424347` | `bg-block-1…4` | Neutral stand-ins for photos and avatars (list thumbs). |

## Contrast (WCAG AA)

Text needs 4.5:1 (3:1 at 18.66 px bold / 24 px and up); icons that are controls or carry meaning need 3:1.
Measured with the WCAG relative-luminance formula. Every pair used on the dashboard passes.

| Foreground | on page `#e9e9ec` | on shell `#f4f4f5` | on card `#fcfcfc` | on well `#ececee` | Needs | Result |
| --- | --- | --- | --- | --- | --- | --- |
| `fg` `#151517` (text) | 15.05 | 16.59 | 17.78 | 15.46 | 4.5 | pass |
| `fg-muted` `#5e5f64` (text) | 5.26 | 5.80 | 6.21 | 5.40 | 4.5 | pass |
| `fg-subtle` `#838489` (icons only) | 3.08 | 3.40 | 3.64 | 3.16 | 3.0 | pass (was `#a3a4a9`: 2.05–2.43, **failed**, darkened) |
| `accent` `#1f3be8` (bars, quote rule, focus ring) | 6.08 | 6.71 | 7.18 | 6.25 | 3.0 | pass |
| `mark` `#b45309` (the amber underline: a line, so 3:1 applies) | 4.14 | 4.57 | 4.89 | 4.26 | 3.0 | pass |

| Pair | Ratio | Needs | Result |
| --- | --- | --- | --- |
| `on-primary` white on `primary` `#151517` (button, active nav) | 18.24 | 4.5 | pass |
| `on-lime` `#263409` on `lime` `#c8f26c` (change label) | 10.38 | 4.5 | pass |
| white on `block-1` `#737479` | 4.66 | 4.5 | pass (was `#76777c`: 4.47, **failed**, darkened) |
| white on `block-2` `#65666b` | 5.73 | 4.5 | pass |
| white on `block-3` `#54555a` | 7.44 | 4.5 | pass |
| white on `block-4` `#424347` | 9.88 | 4.5 | pass |

Text on the goal bar sits on `well` with a 5% black fill (`#e0e0e2`; `fg` on it is 13.83:1). Radar ring names
are `fg-muted` with a `card` halo, so they read against the card, not the blue fill.

## Type

One family: Inter (`font-ui`, loaded with `next/font/google` in `src/app/layout.tsx`, weights 300–600).

| Token | Size / line | Utility | Used for |
| --- | --- | --- | --- |
| `--text-caption` | 11 / 16 px | `text-caption` | Small meta: "Current level", tile lines, list subtitles, lime label. The smallest text allowed anywhere. |
| `--text-label` | 12 / 16 px | `text-label` | Stat rows, list cells, status labels, header actions ("Last 30 days", "See all"). |
| `--text-body` | 13 / 20 px | `text-body` | List names (semibold), buttons (medium), quotes. |
| `--text-lead` | 15 / 20 px | `text-lead` | The words beside the big number ("· target B2"), medium. |
| `--text-title` | 17 / 24 px | `text-title` | Card titles, medium weight, slight negative tracking. Quiet: never bold. |
| `--text-heading` | 28 / 36 px | `text-heading` | The one page heading of the signed-out pages ("Know exactly what to fix before your speaking exam", "Welcome back"), medium weight, tight tracking. |
| `--text-display` | 44 / 52 px | `lg:text-display` | The home page heading on laptops (≥ 1024 px) only; phones keep `text-heading`. Medium weight, tight tracking. |
| `--text-stat` | 36 px / 1 | `text-stat` | The one big figure per card (the level, "B1"), **light** (300), tight tracking. |

Weights: 300 for big numbers, 400 for text, 500 for titles and buttons, 600 for values and list names.

## Shape and elevation

| Token | Value | Utility | Used for |
| --- | --- | --- | --- |
| `--radius-shell` | 40 px | `rounded-shell` | Desktop app frame. |
| `--radius-card` | 24 px | `rounded-card` | Cards. |
| `--radius-tile` | 16 px | `rounded-tile` | Tiles inside a card (exam parts). |
| `--radius-icon` | 12 px | `rounded-icon` | Active sidebar square. |
| (Tailwind) | full | `rounded-full` | Pill buttons, labels, goal pill, progress bars, icon buttons, thumbs. |
| `--shadow-card` | two very soft layers | `shadow-card` | Cards and the desktop frame. The heaviest shadow allowed. |

## Layout

- **Frame (≥ 768 px, `md`):** `bg-page`, then a rounded `bg-shell` frame (max 1280 px, 24 px padding). Left: a 48 px icon
  rail with the wordmark on top. Right: the top bar (quiet text actions on the right: "All tasks"; hidden on phones),
  then the page. 768 px, not 1024 px, so a laptop at 125–150% zoom or a half-screen window (often 850–1000 px wide)
  still gets the desktop frame, never the phone bottom bar. Covered by `e2e/responsive-frame.spec.ts` (390, 900, 1440 px).
- **Two-column grid (≥ 1024 px, `lg`):** `1fr` | `~0.44fr`, 16 px gaps. Cards use 24 px padding. Between 768 and 1023 px
  the cards stay one column (in their phone order) inside the desktop frame.
- **Phone (< 768 px):** one column, 16 px side gutters, 20 px card padding. The rail becomes a fixed bottom bar with the
  same items and the same grey active square; the page gets bottom padding so nothing hides under it.
- **Signed out on Home:** a quiet `GuestCard` on top of the dashboard ("You are not signed in", grey "Create account",
  "Sign in" link, both back to `/dashboard`), so a student who opens the dashboard link first knows to make an account.
  Never in mock mode. The page's one black button is unchanged.
- A card may be split into separate cards on phones (the dashboard's progress card) by making it `display: contents`
  below `lg`; its halves then take their own `order`.

## Components (`src/components/ds`)

| Component | What it is |
| --- | --- |
| `Card`, `CardHeader` | Rounded `bg-card` surface with the soft shadow. Header: quiet title, optional action on the right, thin divider under it. |
| `PillAction` | The same pill as a `<button>` (actions that stay on the page: start, finish, try again). Same variants and sizes as `PillButton`. `type="submit"` makes it a form's submit button (sign in, Create account); `onClick` is then optional. |
| `TextField` | Label (`text-label`, muted) above a 44 px pill input (border `fg-subtle`, 3.64:1 on the card), an optional muted hint tied by `aria-describedby` ("At least 8 characters."). Other props go to the `<input>`. |
| `Notice` | A short message in a `well` box (`rounded-tile`, `text-body`, `fg`): `tone="alert"` for a problem to fix, `status` (default) for news ("Your account and all your data were deleted."). Off a card pass `bg-card`. Words only, never colour. |
| `WordmarkLink` | The CEFRO wordmark as a link (`text-body`, semibold, wide tracking). The dashboard's `Wordmark` is this with its own link. |
| `PillButton` | Pill link. `primary` = near-black (main action, e.g. "Start retry"); `quiet` = grey well (e.g. "View report"); `light` = card-white, for pills that sit on a `well` surface. Sizes `lg` (44 px, 13 px text: the one main action of a practice step, easy to hit on a phone), `md` (36 px, 13 px text) and `sm` (28 px, 12 px text). Optional leading icon and `label` (accessible name when the visible text repeats, e.g. "Practise Part 2"). |
| `IconButton` | Round icon-only button. Needs a `label`. |
| `ScoringLabel` | The only attempt status: grey hourglass + "Scoring…", shown in place of the level while an answer is processed. No Passed/Failed, no colour. |
| `DeltaLabel` | Small lime pill for an improvement. Only for positive change. |
| `DemoLabel` | "Demo result. Your answer was not scored." (`variant="mode"`: "Demo mode. Your answer won't be scored.", practice and task list in mock mode; `variant="data"`: "Demo mode. These are example attempts, not yours.", dashboard and History in mock mode). A `well` pill (or `card` off a card) with the `info` glyph, `text-label` (12 px), `fg` text (15.46:1 on well, 17.78:1 on card; glyph `fg-subtle` 3.16 / 3.64:1), `role="note"`, not a button. On every screen built from mock data: at the top of the result card of the `/result` prototype (every state: result, retry, Scoring…, couldn't score) and above the step card of the practice page's mock mode (`?mock=1`). Real results never pass `demo`; tests check both. |
| `StatRow` | `label │ value` row inside a `<dl>`: muted label, thin divider, right-aligned semibold value. |
| `ProgressBar` | 4 px accent bar on a `well` track, with progressbar semantics. |
| `GoalBar` | Grey pill with a black check square, a sentence, and a faint fill for how far along the goal is. |
| `RadarChart` | Radar on ordinal rings (Below B1, B1, B2, Above B2), thin grey grid, accent outline and dots, the soft gradient fill. A skill that was not assessed (`value: null`, e.g. pronunciation when the audio check did not run) gets a dashed axis, a hollow dashed point at the axis end, no polygon vertex, and the label "Not assessed". **No text under 11 px:** two fixed-size versions are picked by the chart's own width (container query). At 23rem (368 px) and wider: full names and ring names at their natural size. Narrower: short names (Gram, Vocab, Flu, Coh, Pron), no ring names, and the level of each skill listed under the chart. The list is always there for screen readers. |
| Part tile (pattern, dashboard) | `well` tile with `rounded-tile`: part (caption, semibold) and its name, the band as the largest text (`text-title`, "Band 2"), its label below (`text-label`, muted, "Higher B1"), and a small `light` pill ("Practise"; "Start" for an untried part, same tile). |
| `ListRow`, `Thumb` | List row: round neutral thumb, semibold name with an optional muted subtitle, aligned cells (shared grid template; a cell with `phone: false` is hidden on phones), optional trailing `menu`. `Thumb` is the neutral avatar/photo placeholder. |
| `Sidebar`, `SidebarItem` | Icon rail (desktop) / bottom bar (phone). Active item = `rounded-icon` grey (`well`) square with a dark glyph (never black: see "One primary action per screen"). Every item is a real link. |
| `TopBar`, `TopBarLink` | Quiet text actions with small grey glyphs, on the right. |
| `Menu` | A button that opens a small card menu (`rounded-tile`, `border-line`, `shadow-card`), with an optional header. Closes on Escape, outside tap or after a choice. Not used by any page now (the Account menu was removed). |
| `styles.ts` | Shared class strings (focus ring, icon button, nav item, text actions), so server and client components render a control the same way. |
| `AppShell` (`features/shell`) | The task-page frame (result, practice): page, shell, rail / bottom bar, back link. `account={false}` leaves out the mocked Account menu; `headerEnd` adds header content (the practice page's real sign-in state). |
| `Icon` | The icon set (24 px grid, currentColor). Add new glyphs here in the same style. |

## Result page (`/result`)

Design prototype of the page a student sees after an answer. Mock data only, no model calls: every scored result is a
saved live evaluator output from `test/fixtures/live-3.6-flash/` (gemini-3.6-flash, **not** the production model).
**Only in mock mode:** `/result` needs `?demo=<key>` or `?mock=1`; a bare `/result` (an old link, a guessed address)
is the not-found screen, so no student ever sees the saved runs as if they were theirs. Real attempts are at
`/result/[attemptId]`.

- **Real types, no UI change later.** The page renders only `ResultPageState`, built by
  `src/features/result/view-model.ts` from a `ResultSource`: the attempt's status, failure, transcript and the
  evaluator's own `SpeakingEvaluation` (`result: MultilevelResult`), plus the rubric's band table. Real attempts plug in
  by building that `ResultSource` from the database instead of `features/result/mock-data.ts`.
- **Quality report optional.** `evaluation.quality` is optional and never read; the page shows no warning for it.
- **Patterns in this answer** (under Biggest fix): at most 3 of the evaluator's `error_patterns`, in its order, each
  with how many listed errors belong to it ("once", "2 times") and the first one's quote. Hidden when there are none
  (most saved runs; `?anchor=A0-below-b1` shows it). Screenshot: `docs/design-system/result-patterns-phone.png`.
- **Phone, top to bottom:** Result ("Part 2 · Band 2 · Higher B1", a 0–5 band meter (band 0 exists) with the target named, the distance
  to the target, "Pronunciation wasn't checked in this attempt." when it was not assessed) → Questions (one row each: Answered / Partly
  answered / Not counted, with a check, half circle or cross glyph and the evaluator's one-line note) → Biggest fix
  (the student's quote, "Try instead", the retry goal, the black "Retry with this goal", the quiet "Learn how" when an
  approved lesson matches the fix: see [Lessons](#lessons-lessonsslug))
  → Skills (each feature folded in a `<details>`: level, then quote and why; Pronunciation "Not assessed" when the audio
  step didn't run) → Your answer (the recording's player when there is one, transcript).
- **Desktop:** [Result, Biggest fix, Your answer] | [Questions, Skills].
- **Biggest fix** follows the scorer's `biggest_fix`: a feature → the first error of that type and its correction (or
  their own words and the evaluator's instruction when there is no error); a question → what they said for it, or the
  question itself when they said nothing, and the model answer; own words → how the answer began and a model answer.
  The goal is the evaluator's first retry focus.
- **Retry goal:** "Retry with this goal" opens the practice page as a retry of this attempt (`?retry=<attempt id>`; in
  the prototype `?mock=1&retry=<fixture id>&run=n`). The goal is shown on every practice screen and on Scoring…, and the
  retry result says **"Goal met"** or **"Not yet"** (a partly met goal is "Not yet · partly there"), with "Your goal: …"
  under the band.
- **States:** Scoring… (steps, no black button; a retry shows "Your goal: …"), Couldn't score (too short to rate = the scorer's `zero_reason:
  too_short`; no speech = failure `transcription_empty`; black "Record again"), Retry ("Band 2 → 3", lime "+1 band",
  "Goal met" read from the evaluator's retry review, else from the judgements: the last goal's skill went up a level or
  its question is now answered; skill rows show "B1 → B2").
- **Switches:** `?anchor=<fixture id>` (`&run=1..3`, default run 1; `A0-below-b1` run 1 is band 2, run 3 is the
  band 0 run), `?state=scoring|too-short|no-speech|retry`, `?flags=off`, `&from=<fixture id>&fromRun=n` (the attempt
  a retry comes from: its goal on Scoring… and the one the retry result checks), `&next=1` (Scoring… opens the result
  after about 4 s: used by the practice page's mock mode).
- **New flags:** none left (`recordingPlayback` and `fixLesson` were removed). **New icons:** `play`, `partly`, `cross`, `info`. **New style:** `PILL_QUIET`.
- **Demo label:** every prototype screen starts its result card with `DemoLabel` ("Demo result. Your answer was not
  scored."), so a tester can't mistake a saved demo score for their own. Real attempts (`/result/[attemptId]`) never
  show it.
- **Checks:** `src/features/result/view-model.test.ts` builds all 19 saved runs, renders every anchor and state with
  flags on and off, and asserts one black button (none while scoring) and no text under 11 px. The screenshots were
  audited in the browser: no horizontal scroll, smallest text 11 px, lowest text contrast 5.26:1.
- Screenshots: `docs/design-system/result-{a2,a4,a0-below-b1,scoring,too-short,no-speech,retry}-{desktop,phone}.png`.


## "Was this feedback helpful?" (result page)

`features/result/FeedbackHelpful.tsx`, on every scored result: Part 1.1, 1.2 and 2 (`ScoredResult`) and Part 3 (`Part3ScoredResult`), real attempts and demo results alike. Never on the teacher's view.

- **Where:** its own small card right after the Biggest fix (after "Patterns in this answer" when that card is shown), on phone and desktop. Asked there because that is the feedback the
  student acts on; later cards (Skills, Your answer) stay below it.
- **Ask:** "Was this feedback helpful?" (`text-body`, medium) with two quiet grey pills, **Yes** and **No** (`PillAction` `quiet`, `md`, 36 px tall, at least 80 px wide). Never black: the page's
  one black button stays "Retry with this goal". Disabled until the page's scripts run (`useHydrated`) and while saving (the tapped pill says "Saving…").
- **After the tap:** the question and pills are replaced by a check glyph and "**Thanks for telling us.** Your answer helps us make the feedback better." (in a `role="status"` live region, so a
  screen reader hears it). On a later visit: "You found this feedback helpful." / "You told us this feedback wasn't helpful." No free-text field in this version.
- **One answer per attempt:** stored on the attempt (`speaking_attempts.feedback_helpful`, `feedback_helpful_at`; migration 0011) by `POST /api/speaking/attempts/[id]/feedback`; the server keeps
  the first answer, so a second tab or a repeated request changes nothing. A failed save keeps the question with "We couldn't save your answer. Please try again." (`role="alert"`).
- **Demo results** (`?mock=1`, `?demo=`, `?anchor=`) show the same card; the thank-you appears and nothing is sent or stored.
- **Owner counts:** `npm run stats:feedback` (Yes / No / not answered, per part and per scorer; the mock scorer is listed apart).
- **Contrast and size:** `fg` on `card` 17.78:1, `fg-muted` on `card` 6.21:1, `fg` on `well` (the pills) 15.46:1; smallest text 12 px (the error line).
- Screenshots (390 px): `docs/design-system/feedback-helpful-{before,after}-phone.png`.

## Transcript with mistakes and better versions ("Your answer" card)

Step 5 of `docs/v1-plan.md` (section 3.3). Components: `features/result/TranscriptWithFixes.tsx` (client), `transcript-fixes.ts` (pure view model), the checks in
`domain/evaluation/sentence-fixes.ts`. The same card on `/result`, `/result/[attemptId]`, Part 3's result page and the teacher's read-only attempt page.

- **The card:** "Transcript" with the count on the right ("6 sentences to improve", "1 sentence to improve", "No sentences marked in this answer"), one line under it ("Tap an underlined sentence to
  see a better version."), then the transcript. The count is the number of **sentences** that hold a mistake (a sentence with two mistakes counts once and opens both).
- **The mark:** the words the student said wrong are underlined in amber (`mark`, 2 px, 4 px offset, ink-skipping off, solid). Never red, never a fill, so it also reads without colour (it is a line).
  `mark` on card is 4.89:1, on the open sentence's `well` 4.26:1 (a line needs 3:1). The browser test measures the live colour at 390 px.
- **Tap:** a sentence with a mistake is one real `<button>` (inline, text colour `fg`, a `well` fill while it is open or hovered, accent focus ring), `aria-expanded`, disabled until the page's scripts
  run (`useHydrated`). It opens **under that sentence**: the paragraph splits there and a `well` panel shows, per mistake, **You said** (the student's words as the transcript has them), **Better**
  (the same words with the changed words in bold) and **Why** (one line, muted). One sentence open at a time; tap again to close. Labels are 11 px (`text-caption`), the rest 13 px.
- **No new black button, no new action.** The page's black button is still "Retry with this goal"; the teacher's page has none.
- **Never a model answer:** there is no "Improved answer", no whole rewritten text. `Better` is the student's own sentence with at most a few words changed (the code checks this; the evaluator's
  prompt asks for it). "What you did well" and Biggest fix are unchanged.
- **Old results:** a result saved before evaluator 3.6.0 has no list (`transcriptFixes` is null): the plain "Transcript" paragraph, exactly as before, no count.
- **Part 3:** the same card; words read from the two lists keep their dotted underline and the line "Dotted underline: words read from the lists." Both marks can sit in one sentence.
- **Checks:** `features/result/transcript-fixes.test.ts`, `domain/evaluation/sentence-fixes.test.ts`, `e2e/transcript-fixes.spec.ts` (390 px: count, underline colour not red and at least 3:1, tap opens under the
  sentence, one open at a time, keyboard, no model answer, plain transcript for an old result, Parts 1.1 / 1.2 / 3, teacher page, scripts delayed; every screen audited: one black button (none on the
  teacher page), no text under 11 px, AA contrast, no horizontal scroll).

## Practice flow, Part 2 (`/practice/speaking/[taskId]`)

The steps a student goes through before the result, on the design system. The recorder, upload, polling and
evaluation code are the app's real ones; only the screens changed. The page moved out of the `(site)` route group into
`src/app/practice/speaking/[taskId]/` (same URL) to use the task-page shell; it runs the server-configuration check
itself (it used to come from the `(site)` layout), except in mock mode.

- **Phone, top to bottom:** the step card (title or timer, the goal of a retry, the one action), then the questions
  and the picture. **Desktop:** [questions and picture] | [step card]. The picture is beside the questions when their
  card is wide enough (container query), else above them on the brief and below them while preparing and recording,
  where the questions matter most.
- **1. Brief:** "Speaking · Part 2 · Practice" (or "Retry"), the task title, the topic line, Prepare 1 min / Speak
  2 min tiles, the picture with "You don't need to describe the picture", the 3 questions, the black **"Start
  preparation"**. A retry also has "Practise without the goal". Earlier attempts (real mode) are listed under it.
- **2. Preparation:** "Preparation", a 1-minute countdown with a thin bar, one line of advice, the quiet **"Start
  speaking now"** (no black button: waiting is the main action). Recording starts by itself at 0:00.
- **3. Recording:** a dot + the word "Recording" and a live 5-bar microphone level (never colour alone), a 2-minute
  countdown and bar, "You've spoken for 0:23", the black **"Finish"**. Finishing under 1 minute (`EARLY_FINISH_MS`
  in `lib/practice-flow.ts`) opens "Finish already?" in the card instead: black "Keep speaking" (focused), quiet
  "Finish anyway"; the recording keeps running. At 0:00 it finishes by itself, without the warning.
- **Start of speaking:** when the minute of preparation runs out, recording starts by itself (it always did). It now
  also plays the chime, shows "Speak now" beside "Recording" for 4 s and announces "Recording started. Speak now." to
  screen readers. Same when the student skips with "Start speaking now". The chime is **made in code** (`lib/chime.ts`,
  Web Audio, no sound file; the placeholder `.wav` it replaced is deleted): two soft sine tones, E5 (659 Hz) then A5
  (880 Hz) 0.16 s later, each 0.34 s with a 15 ms fade-in and a smooth fade-out, peak gain 0.18, 0.5 s in all. The
  audio context is created only inside the "Start preparation" click (which also unlocks audio), so the chime can never
  play before the student presses a button; `playChime()` without it does nothing. It resolves when the last tone has
  ended (a watchdog settles it 0.5 s later if the browser never reports the end): recording starts only then, so the
  chime is never recorded. Sound failures (no Web Audio, a suspended output) are ignored.
- **4. After Finish:** the answer is sent at once (there is no listen-back step any more), then the attempt's own
  result page opens (`/result/[attemptId]`, see "Result address" below): **"Scoring…"** (the same `ScoringResult`
  component, with the transcript as soon as it exists and a quiet line if checking is slow), then the **new result
  page**, built from the stored attempt (see "Real attempts" below). The old feedback report is gone.
- **Retry:** opened from "Retry with this goal" (`?retry=<attempt id>`). A small
  well card **"Your goal: …"** (the evaluator's first retry focus) is on the brief (with "You'll know it worked: …"),
  preparation, recording and Scoring…. The answer is sent with the previous attempt's id, as before, so the evaluator's
  retry review judges it.
- **Microphone states** (in the brief card's action area; after the brief, on their own card): **asking** ("Allow
  microphone access", while the browser's prompt is open, no button), **denied** ("Microphone access is blocked" and
  how to allow it on a computer, iPhone/iPad Safari and Android Chrome; black "Try again"), **no microphone** (connect
  one or use a phone; black "Try again"), plus unsupported browser (no button) and recorder failed ("Try again").
- **Mock mode `?mock=1`:** no session, history, analytics or upload, and no API call at all (asserted by the e2e
  test). The real recorder still runs. Finish opens `/result?state=scoring&next=1` (with `&from=` for a retry), which
  opens the mock result after ~4 s; a mock retry result says "Goal met" (retry of A2-b1-all-three) or "Not yet"
  (retry of A3-b2-q3-missing). Every practice link on the result prototype uses mock mode, so the whole loop clicks
  through without API keys: result → Retry with this goal → brief → preparation → recording → Scoring… → result.
  The mocked Account menu is shown only in mock mode; the real page keeps the real sign-in state in its header.
- **New:** `PillAction`, pill size `lg`, icons `stop` and `micOff`, `AppShell`.
- **Checks:** `components/screens.test.ts` (one black button per screen, none while preparing, while the browser asks
  for the microphone or with an unsupported browser; no text under 11 px; questions and picture on every screen; the
  goal on every retry screen; the goal hand-off to Scoring… and "Goal met" / "Not yet"); `e2e/practice-flow.spec.ts`
  (real flow, microphone states, early finish, mock loop). Screenshots audited in the browser at 1440 px and 390 px:
  no horizontal scroll, smallest text 11 px, one black button where expected.
- Screenshots: `docs/design-system/practice-{brief,brief-retry,mic-asking,mic-denied,mic-none,preparation,preparation-retry,recording-retry,recording-early-warning,scoring-retry,result-goal-met,result-not-yet}-{desktop,phone}.png`.


## Practice flow, Part 1.1 and 1.2 (`/practice/speaking/[taskId]`, not live)

Part 1 tasks (a task with `delivery`) open `Part1Experience` on the same page. Not live (`PART_LIVE`): only `?mock=1`.

- **Introduction:** "Speaking · Part 1.1 · Practice" (or "Retry"), title, topic line, tiles Questions (1–3 / 4–6),
  Prepare "None", Speak ("30 s each" / "45 · 30 · 30 s"), the task's instructions (headphones recommended), the goal
  of a retry, the black **"Start"** (it unlocks audio and asks for the microphone). The questions are not listed.
- **Each question:** "Question 5 · 2 of 3", the question text (stays visible), the step ("Listen to the question" →
  "Start speaking at the chime" → the recording dot, "Speak now", the countdown and bar, the 5-bar level), "The next
  question starts by itself." No black button. Part 1.2: the two pictures beside (desktop) or under (phone) it.
- **Microphone problems** use the Part 2 states (`MicrophoneState`) in the introduction card.
- **Checks:** `e2e/part1-practice.spec.ts` at 390 px: one black control (none while the questions run), no text under
  11 px, AA contrast, no horizontal scroll.

## Part 2 tasks

Seven Part 2 tasks (`src/content/speaking/b2/`), all the same shape: 1 min preparation, 2 min speaking, 3 questions
(1 and 2 about the student's own story, 3 a general opinion), one picture. "Advice from someone" stays first in the
list (the recommended first practice); then An important decision, A goal you set, Working in a team, Trying and
failing, A tradition, A happy day. Pictures are original flat SVGs (480 × 360, no text, no brands, no real people,
© 2026 CEFRO, all rights reserved), listed with source and licence in `public/tasks/README.md`. The task list (`/practice`)
has one section per exam part (`id="part-2"`). The picture shows the topic, never an answer.
Practise next rotates through them (never practised first, then the one practised longest ago). Checked at 390 px:
no horizontal scroll, smallest text 11 px, one black button ("Start preparation") on each brief.

## Real attempts on the result page

The practice page shows the result page's own components for a stored attempt, so a real attempt looks exactly like
the prototype.

- **How:** `features/result/from-attempt.ts` turns the attempt the API returns (`AttemptView`) into the view model's
  `ResultSource` (status, failure, transcript, the stored `MultilevelResult`, the previous attempt for a retry, the
  band table from the rubric, passed in by the page). `resultPageState` then picks the screen: Scoring…, the scored
  result, "We couldn't score this answer" (too short / no speech) or the failure screen. A stalled attempt goes to the
  failure screen. An attempt scored with the old method (no Part band) gets a short notice instead.
- **Actions** take a link or a callback (`ActionTarget`): on `/result/[attemptId]` "Compare" and "Try again" act on the
  page, "Retry with this goal" and "Record again" open the practice page; on the prototype they are all links.
- **Real-only parts:** a real audio player for the stored recording (no placeholder when there is none); a
  quiet "Development evaluator." note when the mock evaluator scored it; "Compare with your last attempt" (quiet, small)
  on a retry whose previous attempt is loaded (it is fetched when missing).
- **Retry comparison** (`features/result/comparison.tsx`): attempt N-1 vs N as two band tiles, the honest verdict
  (from `domain/speaking/comparison.ts`: one band is "slight"), "+1 band" in lime only when the band went up, the goal
  review ("Goal met" / "Not yet" / "Not yet · partly there" with the evaluator's evidence), "What changed" per skill in
  words (lime "Up" only for an improvement), speaking time / words / hesitations, both transcripts folded. Black
  "Retry with this goal" (the newer attempt's first focus), quiet "Back to attempt N result".
- **Error screens:** upload failed (the recording stays in the tab: black "Try sending again", quiet "Download a copy"
  and "Record again"; resent by itself when back online); scoring failed (`FailedResult`: black "Try again" when the
  saved recording can be scored again, else black "Record again"; the other is quiet; "That didn't work" if the
  retry fails); answer not found and "can't compare" (`NoticeCard`, one black action); a problem above a screen
  (`InlineNotice`, no button).
- **Server not configured** (`src/app/error.tsx`): in production the practice page and the task list still
  answer 500 when a provider or sign-in setting is missing (`/api/health` 503); the page now shows "CEFRO isn't
  available right now" with a reference number, black "Try again" and quiet "Go to the dashboard", instead of Next's
  default error page. It never says why (production hides error details). Mock mode needs no configuration.

## Result address (`/result/[attemptId]`)

Each attempt's result has its own page, so a reload or a link reopens it. After Finish the practice page uploads, then
opens it: Scoring… (polled), the result, the retry comparison, and the failure screens all live there; "Your attempts"
on the brief link to it. The `/result` prototype (no id, query switches) is unchanged.

- **Owner only.** The page uses the API's own check (`getAttemptViewForUser`) with `findCurrentUserId` (a read-only
  owner lookup for pages: a page cannot set cookies). Another account or browser, a missing id and a malformed id all
  get the same **not-found screen** (`app/not-found.tsx`, status 404), so an id reveals nothing.
- On opening, the page reads the attempt once through the API (the server's copy can be a moment old) and polls while
  it is processed. A temporary failure is restarted by itself only if the attempt was still processing when the page
  opened: viewing an old failed attempt never re-runs scoring.
- Retry and "Record again" go back to the practice page (`?retry=<id>` keeps the goal).

## History (`/history`)

Every attempt of the student, newest first, from the database. The sidebar's History item and the dashboard's "See
all" lead here. Server-rendered: the filter and "Show more" are links (`?part=1.1|1.2|2|3`, `?show=40`), so it works
without JavaScript and a filtered view has its own address.

- **Rows:** task title, part, date (dd.mm.yy, Uzbekistan time), the **level** as the main value with "Band 2 · Higher
  B1" under it (the level is the band's own label without Lower/Higher, so it never contradicts the band), a "Retry"
  label on retries with "Goal met" (check) or "Not yet" (half circle) once scored, read exactly as the result page
  reads it (`compareWithPrevious`). "Scoring…" while processing; "Not scored" for failed, stalled, too-short and
  old-method attempts. The whole row opens `/result/[attemptId]`.
- **Filter:** "All" plus only the parts the student has tried, in exam order. The active one is a white pill with a
  check (not colour alone, `aria-current`). A part never tried, or a made-up value, shows All. The part of a task comes
  from its snapshot (`domain/speaking/exam-part.ts`: part 1 with target A2 is 1.1, with B1 is 1.2).
- **Band over time:** the selected part (under All, the latest attempt's part), oldest to newest, the last 20 scored
  attempts, 0 to the part's top band, one accent line with dots, the target band as a dashed line named in a key under
  the chart ("Target · Band 3"). Hidden below 3 scored attempts of that part (too-short answers are not points). Text
  is HTML, never scaled SVG text; hovering a dot shows its date and band; a table of every point for screen readers.
- **Long histories:** 20 rows, then a quiet "Show more" (+20) with "Showing 20 of 45".
- **Empty state:** "No attempts yet", one line, the black "Start your first practice" (Part 2), the only black button
  on the page.
- **Desktop:** title and filter, then [Your attempts] | [Band over time] (the list takes the full width without the
  chart). **Phone:** filter, chart, list.
- **Owner only:** the caller is identified exactly as on the result page (`findCurrentUserId`) and only rows recorded
  under that user id are read (`listAttemptsForUser`). A browser with no identity yet sees the empty state.
- **Dashboard:** Recent attempts lists the same rows (the latest 4, real data, same row component) and "See all" links here. The rest of the dashboard is still mocked. If the attempts cannot be
  read, only that card says so.
- **Checks:** `features/history/view-model.test.ts` (order, level and band, statuses, retries and goals, filter,
  paging, chart threshold and target, markup: one black button only on the empty state, no text under 11 px);
  `app/api/cross-user.test.ts` (the page as alice, bob, an anonymous browser: each sees only their own; fails if the
  owner filter is removed); `e2e/history.spec.ts` (empty → record → retry → list, filter, row opens result, chart at 3,
  dashboard and See all, another browser sees nothing, no horizontal scroll at 390 px).
- Screenshots (1440 px and 390 px, seeded data; the Part 1.1 / 1.2 rows are relabelled Part 2 results, as Part 1 has
  no evaluator yet): `docs/design-system/history-{full,filtered,empty,few}-{desktop,phone}.png`. Audited in the browser:
  no horizontal scroll, smallest text 11 px, one black button on the empty state and none elsewhere.

## Mock mode everywhere (`?mock=1`)

Every page a tester walks through has a mock mode: the task list (`/practice?mock=1`), the practice page, the result
prototype, the dashboard and History. Built so a branch's Vercel Preview (no variables, no database) can be clicked
through end to end.

- **Demo student** (`server/demo/demo-data.ts`): six attempts on five Part 2 tasks, newest first: a retry of "A
  tradition" with its goal (answer question 3: "Goal met"), its original, three answers on other tasks, one attempt
  with no speech ("Not scored"); exam in 23 days.
- **Demo results are for their own task.** Each task has a hand-written demo answer (`features/demo/demo-answers.ts`):
  the "first" answer leaves out question 3, the "full" one (a retry) answers it. It goes through the real
  `evaluateSpeaking` with the existing mock evaluator (no delay, no model call), so each result is a real
  `SpeakingEvaluation` for that task's questions; computed once per server process. A demo attempt opens
  `/result?demo=<id>&mock=1`; Finish in a mock practice opens `answer.<task id>` (or `retry.<task id>.<key>` for a
  retry, judged against its goal). The saved-runs prototype (`?anchor=`) stays as it was, for "Advice from someone".
- **Mock evaluator key words:** the mock evaluator counts key words per question to decide whether it was answered.
  Each task has its own mock-only list per question (`server/evaluation/mock-question-keywords.ts`; only the mock
  evaluator imports it, real scoring never reads it), so a full demo answer counts 3 of 3 answered on every task and an
  answer that only tells the story leaves question 3 missing (`server/evaluation/mock-evaluation-model.test.ts`).
- **Mock evaluator wording:** its tips and model answers no longer borrow the advice task's topic (examples on a topic
  of their own; a missed question's "model answer" says how to answer that question).
- **Links:** `features/demo/demo-mode.ts` (`withMock`, `mockLink`, `isMockQuery`) and `demoHref`, which turns links built
  from demo attempts into mock ones (`/result/<demo id>` → the prototype with that saved run; `?retry=<demo id>` → that
  saved run). Components with fixed links take a `mock` prop (`AppShell`, `Wordmark`, `BackLink`, `navItemsFor`,
  `FindYourLevelCard`, `RecentAttemptsCard`, `HistoryContent`). The nav's active item is matched on the path.
- **Labels:** one `DemoLabel` per mock page (task list and dashboard: under the header; History: above the content;
  practice and result as before). 12 px, `fg` on `card`, so contrast and size rules hold.
- **Exam date** in mock mode: Save, Skip and Remove date change the page only (`ExamDate demo`), with the server's own
  date rule (`examDateProblem`).
- **Account menu** in mock mode: the demo account and "Demo account. Sign-in is off in demo mode."; no items.
- **Checks:** `features/demo/mock-pages.test.ts` (each mock page on a Preview-like configuration with the database,
  cookies and identity throwing: label, only `mock=1` links, one black button where there is one, no text under 11 px;
  real pages still refuse), `server/demo/demo-data.test.ts` (every demo attempt's result has the attempt's task id and questions), `e2e/mock-mode.spec.ts` (also on a production build:
  `npm run test:e2e:preview`).

## Lessons (`/lessons`, `/lessons/[slug]`)

**Lessons list (`/lessons`, the Lessons tab):** every approved lesson (`shownLessons`), one row each: book glyph, the
title (semibold) and the lesson file's Variant field ("Part 2 (B2)", caption, muted), a chevron; the whole row (56 px)
opens the lesson. No other text: no lesson has an approved one-line summary, and none is invented. No black button.
`?mock=1` keeps every link in mock mode; without it the page checks the configuration like every real page (it reads
no database). `src/features/lessons/LessonList.tsx`.

**A lesson opened from the list** (`/lessons/<slug>`, no result in the address): the same lesson, explanation,
examples and drill, but no result to fill it from, so no "Why this lesson", no goal, no "Ready for your retry" and no
"Retry with this goal". The caption is "Lesson · Part 2 (B2)", the back link says "Lessons" (to the list), and the last
card, "Practise Part 2", has the lesson's own "Remember:" line and the one black **"Go to Part 2"** (the Part 2 task
list, `/practice#part-2`). That wording is reused from the Account page and is **for the owner's review**
(`src/features/lessons/no-result.ts`). Every approved lesson is a Part 2 lesson today (a test checks it).

**A lesson opened from a result** ("Learn how"): unchanged, below. The lesson for a result's biggest fix (`docs/teaching-plan.md`). Content in `src/content/lessons/`, copied word for word
from `docs/lessons/drafts/` (a test compares every string with its file). Only **approved** lessons are ever shown
(`getShownLesson`, `lessonForResult`); a draft never gets a link or a page. Today: L-T1, L-T8, L-T4 (B2), approved by
Asadbek on 2026-11-07 (recorded in each lesson file and in code; a test checks they match).

- **Which lesson:** `features/lessons/choose.ts`, by code from the evaluator's `biggest_fix` and question statuses
  (teaching plan, section 4): a missing question → L-T1; every question off topic with picture words → L-T8; a
  `minimal` / `partial` question in Part 2 → L-T4 (B2). Anything else (feature fixes, own words, other off-topic
  answers) has no approved lesson yet, so **no link**.
- **Result page:** a quiet "Learn how" pill (book icon, accessible name "Learn how: <lesson title>") next to the black
  "Retry with this goal" on the Biggest fix card. None when no approved lesson matches.
- **Lesson page, phone first, top to bottom:** back link to the result → title and "Why this lesson" (the lesson's line,
  filled from the result) → How it works (the explanation, ≤ 120 words) → Examples (the made-up example topic, then 3–4
  weaker → better pairs with their notes) → Self-check drill (each prompt with its time and a quiet Record / Stop /
  listen-back, kept in the browser, never uploaded or scored; then the checklist) → Retry the same task (the goal the
  retry carries, the lesson's reminder, and the one black button **"Retry with this goal"**, the same retry link as the
  result page's, so the goal is carried over).
- **Drill self-check:** each prompt is labelled with the drill-topic question it practises ("Q1", "Q3", "Q1–Q3"). After a
  recording stops: "Listen back. Did you: <the prompt's own approved instruction>?" with grey **Yes** / **Not yet** (no
  new teaching wording; a test checks every piece is in the prompt). Yes marks the prompt done (small tick); Not yet
  shows "Try once more" and keeps "Record again"; a new recording asks again. When every prompt is Yes, "Ready for your
  retry" shows just above "Retry with this goal". Nothing is saved or uploaded; it resets when the page closes.
- **Navigation on a lesson:** the Lessons (book) tab is the current section (the grey active square, as on every page),
  a link to the list; "Retry with this goal" (or "Go to Part 2") stays the only black control on screen.
- **No checklist on the page:** the per-prompt self-checks cover it. The checklist lines stay in the lesson files,
  marked "not shown (covered by drill self-checks)", and in the lesson data (`drill.checklist`, not rendered).
- **Drill topic:** each lesson's drill has its own made-up topic (a place you like to visit, a skill learned outside
  school, a book or film), none of the 7 Part 2 tasks, so the **same drill is shown for every retry task**. From
  `docs/lessons/drill-drafts.md`, approved by Asadbek on 2026-11-07 (lesson version 2); the first drills, written for
  "Advice from someone", are retired. L-T8's drill picture is a one-line description in the drill-topic box; there is
  no image.
- **Addresses:** `?demo=<demo key>` and `?anchor=<fixture>&run=n` (mock data, every link keeps `?mock=1`), or
  `?attempt=<id>` (a real attempt, its owner only, like `/result/[attemptId]`). None of them: the lesson opened from
  the list (above). A result that is not found, or a lesson the result does not lead to, is the not-found screen.
- **Mock mode:** the demo result of "A tradition" (`demo-5`, question 3 missing) leads to L-T1. Two demo results exist
  only for the lessons: `picture.b2-part2-advice-from-someone` (L-T8) and `bare.b2-part2-advice-from-someone` (L-T4),
  produced by the mock evaluator, whose mock-only rules (`server/evaluation/mock-answer-rules.ts`, imported by nothing
  else; tested) mark an answer whose every sentence talks about the picture as off topic,
  and a question answered in one sentence of at most 6 words as `minimal`. The `/result` prototype strip links to all
  three ("With a lesson").
- **No mascot yet.** The title card can take one on the right later.
- **Tests:** `src/content/lessons/lessons.test.ts` (word for word, format, only approved shown),
  `src/features/lessons/choose.test.ts` (which lesson; the goal carried; **examples never use the retry task's topic,
  for every lesson × all 7 Part 2 tasks**), `src/features/demo/mock-pages.test.ts` (each lesson page in mock mode: one
  black button, no text under 11 px, only `?mock=1` links, not-found cases), `e2e/mock-mode.spec.ts` (result → Learn
  how → lesson → drill → Retry with this goal, at 390 px).

## Controls wait for the page (`useHydrated`)

`components/ds/useHydrated.ts`: false in the server HTML and during hydration, true once the scripts run. A control that
needs React renders disabled until then, so it is never used "before the page is ready": the exam-date picker, Save,
Skip, Edit, Cancel, Remove date; the sign-in and Create account buttons (before: a tap or Enter submitted the form as a
GET, with the email and password in the address, and reloaded the page; as a second layer the form is now
`method="post"`, so even a form sent without the app keeps them out of the address); the brief's Start preparation and Practise
without the goal (before: a tap did nothing). Browser tests delay the scripts by 4 s and check each.

## Page failures

Every page failure shows the design-system screen, never Next's plain error page: `app/error.tsx` (inside the root
layout) and `app/global-error.tsx` (the root layout itself) share `features/shell/ErrorScreen.tsx`. Status codes are
unchanged. Checked on production builds:

| Case | Pages | Status | Screen |
| --- | --- | --- | --- |
| Server not configured | home, login, register, practice, `/result/[id]` | 500 (`/api/health` 503) | "CEFRO isn't available right now" |
| Database unreadable (corrupt file) | `/result/[id]` | 500 (`/api/health` 503) | same |
| Unknown page, unknown task, someone else's result | — | 404 | "We can't find this page" |

Pages that read nothing from the database on the server (home, login, practice) still open with a broken database;
their API calls fail into the in-page screens (upload failed, scoring failed). Mock mode and the prototypes need no
configuration. Without JavaScript a failed page is blank (Next sends an empty error shell and draws the screen in the
browser); it never shows the raw "Internal Server Error". Screenshot: `docs/design-system/not-found-phone.png`.

## Account menu (removed)

The `(site)` header's `AccountMenu` was deleted with the `(site)` layout (`claude/practice-list`): no page used it any
more. Who is signed in is shown by the Account tab (`data-testid="account-status"`, `data-state`) on every app page,
and the Account page shows "Practising without an account" with Sign in / Create account. `Menu` stays in
`components/ds` for a future menu. The checks below belong to the practice flow's real-attempt screens.

- **Checks:** `features/result/from-attempt.test.ts` (stored attempt → result page, retry "Goal met", development
  evaluator note, real player, every status, old method; comparison and error screens: one black button, no text under
  11 px). `e2e/practice-flow.spec.ts`: record → upload → evaluate (mock providers) → new result page → retry with goal →
  comparison → reopen from history; auto-start after preparation with the beep and "Speak now" (Playwright clock);
  upload failure, scoring failure, answer lost. `e2e/auth.spec.ts` uses the Account tab and the Account page
  (signed out: Sign in / Create account; signed in: Sign out).
- Screenshots (1440 px and 390 px): `docs/design-system/practice-{real-result,real-retry-result,comparison,upload-failed,scoring-failed,answer-lost,server-unavailable,recording-speak-now,account-anonymous,account-signed-in}-{desktop,phone}.png`.
  Audited in the browser: no horizontal scroll, smallest text 11 px, one black button per screen.

## Account page (`/profile`)

Opened directly by the Account tab (no menu). Profile and Settings were merged into it (approved by Asadbek,
2026-11-07); `/settings` redirects here, keeping `?mock=1`. One column. No target level, change email, language,
notifications or "Coming soon" items. Top to bottom:

1. **Your account:** name (small Edit → field, grey Save, Cancel), email (shown, never editable), current level (the
   latest scored Part 2 answer's level as History reads it, with "Part 2 · Band n · label" and its date, and the black
   **"Practise Part 2"**; none: "No level yet" and the black **"Go to Part 2"**; never a level from anything else,
   `features/profile/view-model.ts`), "Member since dd.mm.yy", "N practice attempts".
2. **Your exam:** the dashboard's `ExamDate`, same rules and Uzbekistan days; with no date it reads "Not set · Add exam
   date" instead of asking; Edit has "Remove date".
3. **Password and sign-in:** Change password (current + new, grey submit, POST form; other devices are signed out),
   then Sign out (grey).
4. **Delete my account**, last, in its own card: grey; opens the list of exactly what is deleted, "Your password" and
   "Type DELETE to confirm"; "Delete everything" stays disabled until both are filled and the field says DELETE. The
   server checks the password (wrong ones count like failed sign-ins) before deleting anything. Afterwards the browser
   is signed out and lands on the home page (`/?deleted=1`) with "Your account and all your data were deleted."
   (`role="status"`; never shown in mock mode).

Without an account: "Practising without an account" (no name or email), the level, attempts and exam date, then grey
Sign in / Create account; no password, sign-out or delete sections.

- **Controls wait for the page** (`useHydrated`): Edit, Save, Change password, Sign out, Delete my account and Delete
  everything are disabled in the server HTML. The forms are `method="post"`.
- **Mock mode:** "Demo mode. Changes are not saved." (`DemoLabel variant="changes"`), the demo student
  (`demoAccount`: Student, student@example.com, member for 30 days, the six demo attempts, exam in 23 days). Name and
  exam date change on the page only; Change password says "Demo mode. Your password was not changed."; Delete my account
  shows both steps, then "Demo mode. Nothing was deleted."; Sign out says sign-in is off. No API call; every link keeps
  `?mock=1`.
- **Deletion** (`server/account/delete-account.ts`): audio files first, then one transaction for every row: attempts,
  results, transcripts, recordings and `recording_blobs`, practice sessions, analytics events, login sessions,
  password, the user and the anonymous identities merged into it. See `docs/privacy-todo.md` for what it does not cover.

## Check microphone (practice brief)

On the practice task screen (brief), above the black "Start preparation": the grey **Check microphone**
(`speaking-practice/components/MicCheck.tsx`). Records up to 3 s (grey Stop while recording), then a player and "Check
again". Kept in the tab only (a blob URL), never saved or uploaded; the microphone is released when it stops and when
the brief closes. Blocked microphone: "Your microphone is blocked for CEFRO. Allow the microphone for this site in your
browser's settings (the icon next to the address), then try again." Disabled until the page is ready.

- **Checks** (Account page and Check microphone): `src/app/api/account/account-routes.test.ts`,
  `src/features/profile/view-model.test.ts`, `src/domain/account.test.ts`, `src/features/demo/mock-pages.test.ts`
  (section order, five tabs with the Account tab a direct link and the grey current tab, one black control, POST forms
  with submit disabled, no text under 11 px, only `?mock=1` links, `/settings` redirect, Check microphone grey before
  Start preparation), `e2e/profile-settings.spec.ts` (at 390 px: exactly one black control, the grey current tab, no
  horizontal scroll, no text under 11 px, every text at WCAG AA contrast; the real flows; the audio file gone from disk
  after deletion; the microphone check and a blocked microphone).

## Teacher view (mock mode only until parent consent)

Built from docs/teacher-plan.md. Real pages and APIs are a 404 while `TEACHER_LIVE` is off (`src/config/features.ts`).

- **Mock addresses:** demo teacher Home `/dashboard?mock=1&as=teacher`; class `/teacher/classes/demo-class?mock=1&as=teacher`;
  a student `/teacher/classes/demo-class/students/s1?mock=1&as=teacher`; an attempt
  `/teacher/classes/demo-class/attempts/aziza-2?mock=1&as=teacher`; Create class `/teacher/classes/new?mock=1&as=teacher`;
  student Join `/profile/classes/join?mock=1`, Share `/profile/classes/join?mock=1&code=DEMO42`, after joining
  `/profile?mock=1&joined=DEMO42`.
- **One black button:** Home (teacher) "Create class" (Practise next / Start practice turn grey); Create class "Create
  class", then "Copy code"; class "Copy join code"; student "Open latest attempt"; attempt **none** ("Agree" and
  "Choose level" are the same grey pill, side by side); Join "Continue"; Share "Share with this teacher". Close class,
  Remove from class and Leave class are quiet text actions opening a confirm card with two grey buttons.
- **Components:** `features/teacher/` (`sections.tsx`, `actions.tsx`, `JoinClass.tsx`, `view-model.ts`, `links.ts`);
  the attempt page is `ScoredResult` with `teacher` (student's name, no player, Retry, Learn how or comparison) and
  "Your view" under the result card. `DemoLabel variant="class"`: "Demo mode. Made-up class and students; changes are
  not saved." New icon `plus`.
- **Checks:** `src/features/teacher/teacher-pages.test.ts` (each screen: black buttons, no text under 11 px, only
  `?mock=1` links, nothing read from the database, cookies or identity; real pages 404) and `e2e/teacher-view.spec.ts`
  (the whole loop at 390 px with a WCAG AA contrast check on every text).

### Teacher v1 (`claude/teacher-v1`, step 6 of `docs/v1-plan.md`)

What changed in the Teacher view (details in `docs/teacher-plan.md`, section 10). Still mock mode only; `TEACHER_LIVE` stays false.

- **New mock addresses:** T6 `/teacher/classes/demo-class/mocks/aziza-mock?mock=1&as=teacher` (finished) and `.../mocks/bekzod-mock?...`
  (not finished, Parts 1.1 and 1.2 only); Part 3 attempt `.../attempts/aziza-p3?...`; Part 1.2 attempt `.../attempts/dilnoza-p12?...`; deleted recording
  `.../attempts/madina-1?...`; join link `/join/DEMO42?mock=1` (goes to the Share screen); the one-time card
  `/profile?mock=1&joined=DEMO42&legacy=1`. Sardor (the newest demo student) is on the first Share wording: "Shares Part 2 only".
- **Share screen (S2), wording `v1-all-parts-audio`:** "Will see" is a list: *That name and your level · Every part you practise from now on: 1.1, 1.2, 2 and 3 ·
  Every mock you make from now on · Transcripts and feedback · Your recordings (deleted after 30 days)*. "Won't see": *Earlier attempts, email, exam date.*
  "Won't see: recordings" is gone. Black button unchanged: "Share with this teacher".
- **T6 Student's mock** (`features/teacher/MockView.tsx`, data `mock-view.ts`): header card (student's shown name, "Mock exam · 10.11.26", status
  **Finished / In progress / Not finished**, estimated level at 36 px, the official-scale line); four part cards, each: title + CEFRO level and "Band 3 · Lower B2"
  at the right, the player, the transcript with the sentence view (`TranscriptWithFixes`, one open at a time per card), then **Your view** (compact: caption
  "Your view", CEFRO's verdict, **Agree** and **Choose level** grey, same size, side by side); last card **Your level for this mock** (optional; Agree / Choose level
  with Below B1, B1, B2, C1). **No black button on the page** (checked: 0). A part not done: "This part was not done."; a part with no band: "There is no band to rate
  for this part yet." and its reason. Phone: one column, 390 px with no horizontal scroll; laptop: a 42 rem column.
- **The teacher's player** (`features/result/TeacherPlayer.tsx`): the native audio control with its download entry and its own speed menu switched off
  (`controlsList="nodownload noplaybackrate"`, right-click blocked), under it three grey chips **1x / 1.25x / 1.5x** (36 px high, `aria-pressed`; the chosen one has a
  2 px dark outline, never a black fill, so it is not a second black button) and "Length 1:23". No download link, not even when the browser cannot play it
  (then only a sentence). Deleted audio: the line "Recording deleted on 08.12.26, 30 days after scoring. The transcript and feedback are kept." and no player.
- **T3:** each student row gets "Last mock: B2 · 10.11.26" (or "Not finished · date", "—") and, for a membership on the first wording, a quiet "Shares Part 2 only".
  The join card has the black **Copy join code** and a grey **Copy join link** (copies `https://…/join/CODE`; the status line says opening it only fills in the code).
- **T4:** **Mocks** card first (one history-style row per mock, opening T6), then **Single attempts**. Black button **Open latest mock** (**Open latest attempt** when
  there is no mock).
- **T5:** any part; Part 3 is its own read-only page (`Part3ScoredResult` with `teacher`), "Your view" under the result card, no Retry. Recording: player or note.
- **Student side (Q6):** "CEFRO: Higher B2 · Your teacher: **B2**" under the band heading on Parts 1.1, 1.2, 2 and 3 result pages
  (`data-testid="your-teacher"`; the band heading never moves or changes); on the mock result the "Your teacher" tile (the level the teacher gave the whole mock, else the
  rule on their part levels). Nothing when not rated.
- **"Share recordings too?"** (`ShareMoreCard`, Account page, once, only for a membership on the first wording): a tinted card inside the class row, the title, one
  paragraph ("Your teacher now sees Part 2 attempts only. You can also share Parts 1.1, 1.2 and 3, your mocks and your recordings (deleted after 30 days), from the moment
  you tap. Nothing from before that is shared."), and two grey buttons **Share recordings too** / **Not now**. The Account page keeps its one black button.
- **Checks:** `features/teacher/teacher-pages.test.ts` (every screen: black buttons, 11 px, mock links only, nothing read from the database), `e2e/teacher-v1.spec.ts` (390 px:
  T6, player speed, deleted note, Part 3, T3, join link, the card; WCAG AA contrast on every text) and the updated `e2e/teacher-view.spec.ts`.

### Exam laptop (`claude/exam-laptop`, step 7 of `docs/v1-plan.md`)

Details and rules in `docs/teacher-plan.md`, section 11. Still mock mode only; `TEACHER_LIVE` stays false. Laptop width (1280 px) first, then 390 px.

- **Mock addresses:** start `/teacher/classes/demo-class/exam?mock=1&as=teacher`; T7 `/teacher/classes/demo-class/exam/demo-class-mock/laptop?mock=1&as=teacher&room=Room+1`
  (`&timeScale=0.05` shortens preparation and speaking, browser tests only); T8 `/teacher/classes/demo-class/exam/demo-class-mock?mock=1&as=teacher`. In the demo T7 every PIN is **1234** (the pad says so),
  Dilnoza is "In progress (Room 2)", Aziza and Jasur are Done, Sardor has no PIN, Madina and Bekzod can start.
- **One black button per screen:** T3 **Start exam laptop** (a `PillButton`, size `lg`; **Copy join code is grey now**); start page **Start exam laptop** (**Join and start exam laptop** when joining); T7 list **none**;
  PIN pad **Continue** (disabled until 4 digits); "Hi {name}…" the mock's own **Start mock**; a part running: none; end screen **Back to the list**; Teacher options **none** (End exam laptop and End and close are grey);
  T8 **Open first unrated** (none, with the line "Nothing left to rate.", when nothing is left); Share screen still **Share with this teacher**; the Account page keeps its own.
- **T7 frame:** no `AppShell`: `bg-page`, a column of at most 56 rem, the wordmark as plain text (not a link) and "Class · Mock 3 · Room 1" (`text-label`, muted). **No link on the screen** (browser test: zero `a[href]`).
  Names are 56 px tall tiles (`rounded-tile bg-well`, name `text-lead` semibold, state `text-caption` muted) in a 3-column grid at 1280 px, 2 at tablet, 1 on a phone; groups titled "Not started · 3" (`text-label`, muted).
  A name that can't be tapped is a bordered `div` (not a disabled button): text only, never colour alone ("In progress (Room 2)", "Done", "No PIN yet. Set one on your phone.", "Locked. Ask your teacher.").
- **PIN pad (`features/exam-laptop/PinPad.tsx`):** the student's name as the heading, four dots, a password field (so the keyboard works; digits never shown), a 3 x 4 pad of 56 px `bg-well` keys with
  17 px digits ("Clear", "Delete" in 13 px), the black **Continue**, and a small "Back to the list". A wrong PIN: "That PIN isn't right. 4 tries left." (`role="alert"`).
- **Teacher options** (quiet small text action, bottom right of T7): a card with **email and password** fields (the laptop runs on a device session, not the teacher's login: the card says so and that they are signed back in), "Unlock {name}" per locked student, and the two grey end buttons; every message is `role="alert"`.
- **Class mocks card** (T3, `ClassMocksCard`): `Card` with rows like the students list (title semibold, "10.11.26 · 8 of 9 finished · Closed" `text-label` muted, chevron). **T8** (`ResultsView`): header with the
  class, "Mock 3 · 10.11.26" and "2 of 6 finished"; a **Students** card (name and level at the left, the four bands as a muted `text-label` list, a grey small **Listen**); on laptop the common
  problems card sits at the right (the T3 card, reused).
- **Share screen / Account:** a **Class PIN** field (`type="password"`, `inputMode="numeric"`, 4 digits, 128 px wide, wide tracking, hint in `text-label`); under Your classes "Class PIN: set / not set yet" and a
  small grey **Set PIN / Change PIN** opening a `well` card with a field and a grey **Save PIN**.
- **In class / At home:** plain text beside the date on T6's header (`data-testid="mock-place"`), after the caption on History and T4 mock rows ("Speaking only · 4 parts · In class"), after the title on the
  student's mock result. Never colour.
- **New:** `PillAction` takes `testId` and `label`. No new colour, icon or token. Components: `features/exam-laptop/` (`ExamLaptop`, `PinPad`, `StartExam`, `ResultsView`, `ClassMocksCard`, `results-view.ts`, `laptop-id.ts`).
- **Checks:** `e2e/exam-laptop.spec.ts` (every screen audited: one black control at most, no text under 11 px, AA contrast of every visible text, no horizontal scroll, at 1280 and 390 px; two students in a row on one
  laptop; the lock; End; T8), `e2e/exam-laptop-real.spec.ts` (two laptops, real database).

## Part 3 (mock mode, and the real flow behind `PART_LIVE["3"]`)

Part 3 (official Question 8, balanced argument, target C1, band 0–6; docs/part3-plan.md) is built in mock mode and,
since `claude/p3-real`, as a real flow (record, upload, score, stored result). `PART_LIVE["3"]` stays off: the
dashboard tile and the home page keep "Coming soon", and every real Part 3 page is a 404 (the mock pages need
`?mock=1`). **Real flow, only while `PART_LIVE["3"]` is on (tests turn it on):** see
[Part 3, real flow](#part-3-real-flow-claudep3-real). Everything below describes the screens; they are the same in both.

- **Addresses:** topics `/practice/part3?mock=1`; a topic `/practice/part3/<task id>?mock=1` (`&retry=<demo key>` for a
  retry); a result `/result/part3?demo=<key>&mock=1` (`&state=scoring&next=1`: Scoring… first). Demo keys:
  `p3.<task id>.<points>[.<points>…]`, one point list per attempt (`features/part3/links.ts`).
- **Brief:** "Speaking · Part 3 · Practice" (or "Retry"), the topic, the four instructions, Prepare 1 min / Speak 2 min,
  the goal of a retry, the grey "Check microphone", the black **"Start"** ("Turn your sound on…"). Beside it: the
  statement and both lists (F1–F3, A1–A3).
- **Spoken introduction (as in the exam, Part 2 too):** `PartIntroCard` on its own (no task beside it): "Listen",
  "Part 3" (or "Part 2"), the introduction's text, "The minute of preparation starts by itself after the chime." (Part 2:
  "After the chime, you will hear the questions. Then the minute of preparation starts by itself."), the goal of a
  retry; no button. The same offline voice as Part 1 reads it, then the chime, then the task with the one-minute
  countdown. Part 2's brief keeps its "Start preparation" label.
- **Part 2 questions read aloud (as in the exam):** after the introduction's chime, the task with its questions on
  screen and `QuestionsReadingCard` beside it ("Listen", "The questions", "The minute of preparation starts by itself
  when the reading ends.", the goal of a retry); no countdown, no button. The same voice reads the task line and the
  three questions; when it ends, the preparation countdown starts. Part 3 has no such step.
- **Preparation = choosing:** the 1-minute countdown, "Tick two points in each list…", "FOR n of 2 · AGAINST n of 2"
  (a live status), the quiet "Start speaking now" (no black button). Each point is a native checkbox with a 44 px row;
  a third tick on a side is disabled. Ticked rows are `well`, unticked `card` with a `line` ring.
- **Recording:** starts after the chime; as Part 2 (indicator, level meter, countdown, early-finish warning), the black
  **"Finish"**; when the two minutes run out, recording stops and the chime sounds again; the lists
  show the chosen points with a tick and the word "Chosen" (never colour alone).
- **Result (phone order):** Result (Part 3 · Band n · label, the statement, the 0–6 band meter with the target at 5,
  the distance to C1, "Pronunciation wasn't checked") → **Your points** (FOR / AGAINST, each point with a glyph and a
  word: Developed / Stated, no reason / Stated, then argued against / Not used / Misread; "You chose this point"; the
  student's quote; "Choose two points from each list." as a `Notice` when a side has fewer than two; "Good extra
  argument" for own points) → Biggest fix (one black **"Retry with this goal"**) → **Words from the list** (the
  sentences copied from the lists, measured in code) → Skills (C1 ladder) → Your answer (copied runs marked with a
  `well` background and a dotted underline, plus "(from the list)" for screen readers). Desktop: [result, biggest fix,
  answer] | [points, words from the list, skills]. A retry shows "Band 4 → 5", lime "+1 band" and "Goal met" / "Not yet".
- **Demo answers** follow the points ticked: a first answer develops the FOR points and only rebuts the AGAINST ones
  (band 4, goal "Before you argue against a point, give one real reason that supports it."); the retry develops all of
  them (band 5, "Goal met" when the goal's point is among them).
- **Components:** `features/part3/` (`screens.tsx`, `Part3Practice.tsx`, `result-sections.tsx`, `view-model.ts`,
  `links.ts`); reuses `PracticeLayout`, `GoalCard`, `MicCheck`, `Countdown`, `LevelMeter`, `MicrophoneState`,
  `BandMeter`, `ScoringResult`, `AutoAdvance`. No new tokens or icons.
- **Checks:** `src/features/part3/part3.test.ts` (every screen: black buttons, no text under 11 px; pages only in mock
  mode, only `?mock=1` links, nothing real touched), `e2e/part3.spec.ts` (the loop at 390 px with AA contrast, no
  horizontal scroll, no API call; 404 without `?mock=1`; "Coming soon" kept).

## Part 3, real flow (`claude/p3-real`)

The same screens as the mock Part 3 above, with real data behind them; `?mock=1` is unchanged. Only while
`PART_LIVE["3"]` is on (otherwise a 404).

- **Addresses:** the topics are Part 3's card on `/practice` (real links, no `mock=1`; `/practice/part3` redirects
  there); a topic `/practice/part3/<task id>` (`?retry=<attempt id>` for a retry of the caller's own attempt: goal and
  points come from the stored result); the result `/result/<attempt id>` (owner only, 404 otherwise).
- **Practice:** no demo label; Finish uploads the recording with the ticked points and opens `/result/<id>` ("Scoring…" on
  the way). A failed upload keeps the recording in the tab (the Part 2 "upload failed" card: black "Try sending again",
  quiet "Download a copy" and "Record again"; sent again by itself when back online). Leaving while recording or
  sending asks first. The consent lock (`CONSENT_REQUIRED`) replaces the microphone check and Start on the brief, as in
  Part 2.
- **Result:** the Part 3 result (points, biggest fix, words from the list, skills, answer) with, in "Your answer", the
  recording's player and the 30-day deletion note, or "Recording deleted on …" after it. Not a demo: no demo label.
  The black button is "Retry with this goal" (`/practice/part3/<task>?retry=<id>`).
- **History and dashboard:** a Part 3 attempt is a History row ("Part 3", its level as the main value, "Band n · label"
  under it), the "Part 3" filter appears once one exists, and the dashboard lists it in Recent attempts and fills the
  Part 3 tile's band. The dashboard's level and skills still come from Part 2 answers only (Part 3 is on the C1 ladder).

### AI score not ready yet (Parts 1, 2 and 3)

When AI scoring can't run (no key, no credit, a provider error) **after** the recording and transcript were saved, the
result page is not an error screen (`FailedResult` with `aiPending`, `AiPendingResult` in `features/result/sections.tsx`):

- Card: "Your result · <task>", the heading **"AI score not ready yet"** (`data-testid="ai-not-ready"`), one calm line
  ("Your recording and what you said are saved. The AI score isn't available right now, so there is no band yet.").
- Under it, the transcript and the recording's player (with its deletion note): nothing is lost.
- Actions: the black **"Check again"** (scores the saved recording, no new answer needed; "Checking…" while it runs) and the
  quiet "Record again". After the 30 days the recording is gone, so there is nothing to score again: only the black
  "Record again". A failed "Check again" shows the usual "That didn't work" line.
- A failure before the transcript exists (transcription) keeps its own error screen. One black button, no colour for
  status, text 12–15 px, `fg` on `card`.
- The teacher's attempt page says "AI score not ready yet" too.
- **Checks:** `features/result/from-attempt.test.ts` (Parts 1.1, 1.2, 2 and 3, several failure codes, one black
  button, no text under 11 px), `server/attempts/part3-pipeline.test.ts`, `e2e/part3-real.spec.ts` (no-key server, Part 3
  and Part 2, at 390 px with AA contrast).
- **Checks, real Part 3 flow:** `src/app/api/part3-attempts.test.ts`, `e2e/part3-real.spec.ts` (`npm run test:e2e:part3`: the
  whole loop at 390 px, at most one black control per screen, no text under 11 px, AA contrast, no horizontal scroll).

## Full mock exam (`/practice/mock`, `claude/full-mock`)

Step 2 of `docs/v1-plan.md`: Parts 1.1, 1.2, 2 and 3 back to back in one practice session (`kind` "full_mock"). Built from
`components/ds` and the tokens only; each part is **the single-part flow unchanged** (same spoken introduction, chimes,
preparation and speaking times), played by the same components with an `embedded` prop (`features/speaking-practice/lib/mock-embed.ts`).

- **Open only when all four parts are live** (`fullMockLive()` in `config/features.ts`), or on a test server that sets
  `CEFRO_TEST_FULL_MOCK_LIVE=1` (`next dev` only, ignored in production builds and on Vercel). Otherwise `/practice` says "Coming
  soon." with no button and `/practice/mock` and `POST /api/mock-exams` answer 404. `?mock=1` always works: no account, no database,
  no API call, the first task of each part, and "Mock finished" links to each part's demo result. `?mock=1&timeScale=0.05` (browser
  tests) shortens Parts 1 and 3.
- **Start screen** ("Full mock exam", or "Continue your mock" when parts are saved): one line on length and "You can't pause between
  parts", the four parts (saved ones ticked), the grey microphone check, and the **one black button**, "Start mock" / "Continue mock".
  With a consent lock the lock text replaces the check and the button. The tap makes the mock's one audio element and unlocks sound
  for every later part (phones only play sound a tap unlocked).
- **While a part runs:** the part's own screens, no brief, no result between parts, and above them a **thin "Part 2 of 4" line**
  (`MockProgressLine`: `text-label` plus four segments). Black buttons are the part's own (none on intro and preparation, "Finish" while
  recording).
- **Sending:** each part is sent the moment it ends, in the background, while the next introduction plays (`upload-queue.ts`: one
  idempotency key per part, waits when the server is busy with earlier answers, resends when back online). After the last part the page
  waits until all four arrived (`MockSendingCard`: one row per part "Sending…/Sent/Not sent"; the black "Send again" only for a part
  that can still be sent), closes the mock and opens `/practice/mock/<id>`. "AI score not ready yet" applies per part, on each part's own
  result page.
- **The end of a mock** is the **mock result page** (below), at `/practice/mock/<id>`; in mock mode it opens the demo mock result.
- **Dashboard:** a mock in progress puts "**Continue your mock**" on top of Home (`ContinueMockCard`); its "Continue" is then the
  page's one black button and Practise next / Start practice go grey.
- **Resume and the 24 hours:** which parts are done is the session's attempts. "Continue" plays only the parts not saved, in exam
  order. A mock older than 24 hours becomes `not_finished` (set when it is next read or written to); its finished parts keep their results.
- **Layout:** one column, max 672 px, on phone and laptop; the parts keep their own two-column laptop layouts.
- **Checks:** `domain/speaking/full-mock.test.ts` (order, resume, 24-hour rule, task picker), `features/full-mock/*.test.ts`
  (runner state, upload queue), `app/api/mock-exams.test.ts` (routes, consent lock, cross-user, resume, 24 hours, cards),
  `server/db/migrations.test.ts` (0008), `e2e/full-mock.spec.ts` (the whole mock in mock mode at 390 px with the AA / 11 px / one-black
  audit, a laptop-width pass, "Coming soon").

## Mock result (`/practice/mock/[id]`, `claude/mock-result`)

Step 4 of `docs/v1-plan.md`; replaces "Mock finished". Wording from `docs/official-scale.md` section 5. Components in `features/mock-result`.

- **Top card:** "CEFRO: B2" (36 px level) and, **beside it** when a teacher rated, "Your teacher: B2" (never instead of it), then the exact line
  "Speaking only. An estimate from this mock, not an official UZBMB score." Under each level tile, when all four parts have a band: "Speaking: 49 / 75"
  (14 px, `text-body`; official 0-75 score, `estimateMockSpeaking` in `domain/speaking/mock-score.ts`). The 0-75 score is on the full mock only (and the
  teacher's mock view), never on a single part's result. Never a 0-30 score, Passed / Failed or "certificate level".
- **Score and level (official):** raw = sum of the four part bands (0-21), `rawToSpeaking75` (`domain/speaking/speaking-score.ts`, table and source in
  `speaking-score-table.ts`) gives 0-75, and UZBMB's bands (C1 65-75, B2 51-64, B1 38-50, below B1 0-37) give the level.
- **The interim rule is a fallback only**, `estimateSpeakingLevel` in `domain/speaking/mock-level.ts` (own tests), used where no score can be computed (Part 1.1 has no band): level only, no /75. C1: Part 3 band 5+ and Part 2 band 3+;
  B2: Part 2 band 3+ or Part 3 band 3+; B1: Part 2 band 1+ or Part 1.2 band 3+; else Below B1. Parts 1.2, 2 and 3 must have a band, else
  "Estimate not ready yet" (with the reason: "Part 2 is still being scored", "Part 3 has no AI score yet", "Part 3 was not done"): never a guess.
  Part 1.1 shows in its row but is not read. (Replaced by the official table for complete mocks, 2026-11-13.)
- **Teacher level:** read, never written, from `teacher_ratings` per attempt (own mock's attempts only). Each row shows "Your teacher: B2" when that
  part was rated; the top shows it only when the parts the rule needs are all rated (same rule on the teacher's bands, until step 6 stores a mock-level
  rating). Empty until the teacher screens write ratings.
- **Rows:** one per part: level, "Band 3 · Lower B2", "See details" to the part's own result. While scoring: "Scoring Part 2…"; otherwise "AI score
  not ready yet", "Too short to rate", "Not done". The page polls `GET /api/mock-exams/[id]/result` every 3 s until nothing is scoring.
- **Biggest fix across the mock:** the fix of the part furthest below its own target band (tie: earlier part), with its "Retry with this goal" and "Learn how"
  link where they exist. Hidden ("appears when every part is scored") while any part is scoring.
- **One black button:** "Retry with this goal"; "Back to Practice" is black only when there is no retry. Phone one column; laptop two columns (level and rows | fix).
- **Not finished** (24 h): a note, the parts it has keep their results, the others say "Not done".
- **History:** a mock is one row "Mock exam · B2 · 11.11.26" (or "· Not finished ·", "· Scoring… ·", "· Estimate not ready yet ·") opening the result; pills
  All · Mock exams · 1.1 · 1.2 · 2 · 3 (Mock exams only once there is a mock, like parts). A mock's parts are not listed again under All; a part's own
  filter lists them marked "Part 2 · Mock exam".
- **`/practice/mock/demo-mock?mock=1`:** demo mock from demo answers through the real evaluators. Switches: `state=scoring|unfinished|pending`, `teacher=1`.
- **Checks:** `domain/speaking/mock-level.test.ts`, `features/mock-result/view-model.test.ts`, `features/history/view-model.test.ts`,
  `app/api/mock-result.test.ts` (route, cross-user, teacher, 24 h, page, History), `e2e/mock-result.spec.ts` (390 px and 1280 px, audit), `e2e/full-mock.spec.ts`.
