# CEFRO design system

Every new page (dashboard, feedback screen, lessons, tests) is built only from these tokens and components.
Tokens live in one file: `src/app/design-system.css` (a Tailwind v4 `@theme`, so each token is also a utility class,
e.g. `--color-card` → `bg-card`). Components live in `src/components/ds/`. The first page built on it is `/dashboard`.

The older pages (home, login, register) still use the earlier tokens in `globals.css` until they are redone (their
header already uses the design-system Account menu). The practice page is fully on the design system: every step, the
result page for real attempts, the retry comparison and the error screens.

## Merge order (read before merging)

See **[docs/merge-order.md](merge-order.md)**: the safe order for every open branch, what each contains, and the one
rebase needed (`part1-player`). (An earlier note here called `claude/friendly-darwin-l73xx9` PR #5's branch: PR #5 is
`claude/compassionate-johnson-odu08r`. And `part1-player`'s dev page no longer needs to move into `(site)`.)

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

Only one near-black (`primary`) action per screen. Every other action uses the grey `quiet` pill (or `light` on a
`well` tile). Dashboard: returning = "Practise next · Start" (Biggest fix "Start retry" is grey); first visit = the
welcome card's "Start your first practice" (it goes to the recommended part, Part 2); attempts but none scored = the
same card's "Start practice". All part tiles use the white tile pill. The exam date's Save is grey; Edit, Add exam
date, Skip, Cancel and Remove date are small text actions with a 36 px tap area.

## Feature flags

Elements that are designed but not built are kept in the design behind flags in `src/config/features.ts`:
notifications (bell), search, Mock exam link, "Last 30 days" filter, sidebar Lessons / Settings, the attempt
row menu (Delete, Report a wrong score). Two flags now cover built features (both on): `history` (the sidebar item and
"See all" are real links to `/history`; off: not rendered and `/history` is a 404) and `examCountdown` (the real exam
date: question, countdown, Edit, Add exam date; off: not rendered and Practise next takes the full row).

- **Flag on** (prototype default): the element is shown exactly as designed; tapping it shows a small "Coming soon".
- **Flag off:** the element is not rendered. Neighbours fill the space (e.g. "Practise next" takes the full row when
  the countdown is off; the search row disappears on phones).
- **Exam parts are live or not** (`PART_LIVE`, in the same file): one switch per part. On: the tile says "Start"
  ("Practise" once tried) and links to the part's tasks. Off: "Coming soon", no link. All four tiles are always shown.
  Part 2 is live; 1.1, 1.2 and 3 are not. These are release switches, not preview flags: `?flags=off` leaves them as they
  are, and a part goes live only once it has tasks (checked by `progress.test.ts`).
- Preview with every flag off: `/dashboard?flags=off`. Turn flags off before a page ships; delete a flag when its
  feature is real.

## Dashboard (real data)

Everything on `/dashboard` about the student comes from their own attempts (`listAttemptHistory`, the same owner rule
as History and the result page) and their exam date. Only the first visit's wording, the navigation and the flagged
"Coming soon" controls are fixed. Every number is computed by pure, unit-tested functions in
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
  "Not tried yet", "Start". A part with tasks opens its section of the task list (Part 2: `/#part-2`, where the
  student picks one of the 7 tasks), when the part is live (`PART_LIVE`). A part not live yet (1.1, 1.2, 3) has **no
  link**: its tile says "Coming soon". All four tiles are always shown.
- **Recent attempts:** the History rows (latest 4); the flagged row menu is hidden on phones, where it squeezed the
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

- No colours beyond the tokens below. No new hues; status is shown by word and glyph, never by colour.
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
| `--color-fg-subtle` | `#838489` | `text-fg-subtle` | Icons only (inactive sidebar, status glyphs, clock, bell), radar axis that was not assessed. Not for text. |
| `--color-primary` | `#151517` | `bg-primary` | Primary pill button, active sidebar square, goal check square. |
| `--color-on-primary` | `#ffffff` | `text-on-primary` | Text and glyphs on `primary` and on `block-*`. |
| `--color-accent` | `#1f3be8` | `bg-accent`, `border-accent` | The only hue: radar outline and dots, progress-bar fill, quote rule, focus ring. |
| `--color-radar-core` | `#2f7bff` | — | Radar fill gradient, centre. |
| `--color-radar-edge` | `#d9ecff` | — | Radar fill gradient, edge. |
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
| `--text-body` | 13 / 20 px | `text-body` | List names (semibold), buttons (medium), search, quotes. |
| `--text-lead` | 15 / 20 px | `text-lead` | The words beside the big number ("· target B2"), medium. |
| `--text-title` | 17 / 24 px | `text-title` | Card titles, medium weight, slight negative tracking. Quiet: never bold. |
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

- **Desktop (≥ 1024 px):** `bg-page`, then a rounded `bg-shell` frame (max 1280 px, 24 px padding). Left: a 48 px icon
  rail with the wordmark on top. Right: the top bar (search left; quiet text actions, a thin divider and a bell right),
  then a two-column grid (`1fr` | `~0.44fr`, 16 px gaps). Cards use 24 px padding.
- **Phone (< 1024 px):** one column, 16 px side gutters, 20 px card padding. The rail becomes a fixed bottom bar with the
  same items and the same black active square; the page gets bottom padding so nothing hides under it.
- A card may be split into separate cards on phones (the dashboard's progress card) by making it `display: contents`
  below `lg`; its halves then take their own `order`.

## Components (`src/components/ds`)

| Component | What it is |
| --- | --- |
| `Card`, `CardHeader` | Rounded `bg-card` surface with the soft shadow. Header: quiet title, optional action on the right, thin divider under it. |
| `PillAction` | The same pill as a `<button>` (actions that stay on the page: start, finish, try again). Same variants and sizes as `PillButton`. |
| `PillButton` | Pill link. `primary` = near-black (main action, e.g. "Start retry"); `quiet` = grey well (e.g. "View report"); `light` = card-white, for pills that sit on a `well` surface. Sizes `lg` (44 px, 13 px text: the one main action of a practice step, easy to hit on a phone), `md` (36 px, 13 px text) and `sm` (28 px, 12 px text). Optional leading icon and `label` (accessible name when the visible text repeats, e.g. "Practise Part 2"). |
| `IconButton` | Round icon-only button (bell, row menu). Needs a `label`. |
| `ScoringLabel` | The only attempt status: grey hourglass + "Scoring…", shown in place of the level while an answer is processed. No Passed/Failed, no colour. |
| `DeltaLabel` | Small lime pill for an improvement. Only for positive change. |
| `DemoLabel` | "Demo result. Your answer was not scored." (`variant="mode"`: "Demo mode. Your answer won't be scored.", practice and task list in mock mode; `variant="data"`: "Demo mode. These are example attempts, not yours.", dashboard and History in mock mode). A `well` pill (or `card` off a card) with the `info` glyph, `text-label` (12 px), `fg` text (15.46:1 on well, 17.78:1 on card; glyph `fg-subtle` 3.16 / 3.64:1), `role="note"`, not a button. On every screen built from mock data: at the top of the result card of the `/result` prototype (every state: result, retry, Scoring…, couldn't score) and above the step card of the practice page's mock mode (`?mock=1`). Real results never pass `demo`; tests check both. |
| `StatRow` | `label │ value` row inside a `<dl>`: muted label, thin divider, right-aligned semibold value. |
| `ProgressBar` | 4 px accent bar on a `well` track, with progressbar semantics. |
| `GoalBar` | Grey pill with a black check square, a sentence, and a faint fill for how far along the goal is. |
| `RadarChart` | Radar on ordinal rings (Below B1, B1, B2, Above B2), thin grey grid, accent outline and dots, the soft gradient fill. A skill that was not assessed (`value: null`, e.g. pronunciation when the audio check did not run) gets a dashed axis, a hollow dashed point at the axis end, no polygon vertex, and the label "Not assessed". **No text under 11 px:** two fixed-size versions are picked by the chart's own width (container query). At 23rem (368 px) and wider: full names and ring names at their natural size. Narrower: short names (Gram, Vocab, Flu, Coh, Pron), no ring names, and the level of each skill listed under the chart. The list is always there for screen readers. |
| Part tile (pattern, dashboard) | `well` tile with `rounded-tile`: part (caption, semibold) and its name, the band as the largest text (`text-title`, "Band 2"), its label below (`text-label`, muted, "Higher B1"), and a small `light` pill ("Practise"; "Start" for an untried part, same tile). |
| `ListRow`, `Thumb` | List row: round neutral thumb, semibold name with an optional muted subtitle, aligned cells (shared grid template; a cell with `phone: false` is hidden on phones), optional trailing `menu`. `Thumb` is the neutral avatar/photo placeholder. |
| `Sidebar`, `SidebarItem` | Icon rail (desktop) / bottom bar (phone). Active item = `rounded-icon` black square with a white glyph. An item with `soon: true` looks the same and says "Coming soon". |
| `TopBar`, `TopBarLink`, `SearchSoon` | Optional search on the left, quiet text actions with small grey glyphs on the right. `TopBarLink soon` and `SearchSoon` are future entry points that say "Coming soon". |
| `Menu` | A button that opens a small card menu (`rounded-tile`, `border-line`, `shadow-card`), with an optional header. Closes on Escape, outside tap or after a choice. Used by the row menu and the Account menu. |
| `ComingSoonButton`, `ComingSoonMenu`, `ComingSoonToast` | Future controls behind a feature flag. The button takes the real control's classes (from `styles.ts`), so it looks identical; tapping it shows the toast. The menu is a ⋮ button with a small card menu whose items all say "Coming soon" (closes on Escape or outside tap). The toast is one small near-black pill ("Coming soon") near the bottom, a polite live region; mount it once per page. |
| `styles.ts` | Shared class strings (focus ring, icon button, nav item, text actions), so server and client components render a control the same way. |
| `AppShell` (`features/shell`) | The task-page frame (result, practice): page, shell, rail / bottom bar, back link. `account={false}` leaves out the mocked Account menu; `headerEnd` adds header content (the practice page's real sign-in state). |
| `Icon` | The icon set (24 px grid, currentColor). Add new glyphs here in the same style. |

## Result page (`/result`)

Design prototype of the page a student sees after an answer. Mock data only, no model calls: every scored result is a
saved live evaluator output from `test/fixtures/live-3.6-flash/` (gemini-3.6-flash, **not** the production model).

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
  (the student's quote, "Try instead", the retry goal, the black "Retry with this goal", flagged "Lesson for this fix")
  → Skills (each feature folded in a `<details>`: level, then quote and why; Pronunciation "Not assessed" when the audio
  step didn't run) → Your answer (flagged "Play recording", transcript).
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
- **New flags:** `fixLesson`, `recordingPlayback`. **New icons:** `play`, `partly`, `cross`, `info`. **New style:** `PILL_QUIET`.
- **Demo label:** every prototype screen starts its result card with `DemoLabel` ("Demo result. Your answer was not
  scored."), so a tester can't mistake a saved demo score for their own. Real attempts (`/result/[attemptId]`) never
  show it.
- **Checks:** `src/features/result/view-model.test.ts` builds all 19 saved runs, renders every anchor and state with
  flags on and off, and asserts one black button (none while scoring) and no text under 11 px. The screenshots were
  audited in the browser: no horizontal scroll, smallest text 11 px, lowest text contrast 5.26:1.
- Screenshots: `docs/design-system/result-{a2,a4,a0-below-b1,scoring,too-short,no-speech,retry}-{desktop,phone}.png`.


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
  screen readers. Same when the student skips with "Start speaking now". The chime is **Part 1's sound file**
  (`public/audio/speaking/part1/placeholder/chime.wav`, byte-identical to the one on `part1-player`, an original
  placeholder tone), so both parts sound the same; it replaced the generated beep. `lib/chime.ts` loads and decodes it
  during the "Start preparation" click (which also unlocks audio), plays it with Web Audio, and resolves when it has
  ended (0.4 s; a watchdog settles it 0.5 s later if the browser never reports the end): recording starts only then,
  so the chime is never recorded. Sound failures (file missing, decode error, no Web Audio) are ignored.
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


## Part 2 tasks

Seven Part 2 tasks (`src/content/speaking/b2/`), all the same shape: 1 min preparation, 2 min speaking, 3 questions
(1 and 2 about the student's own story, 3 a general opinion), one picture. "Advice from someone" stays first in the
list (the recommended first practice); then An important decision, A goal you set, Working in a team, Trying and
failing, A tradition, A happy day. Pictures are original flat SVGs (480 × 360, no text, no brands, no real people,
© 2026 CEFRO, all rights reserved), listed with source and licence in `public/tasks/README.md`. The task list (`/`)
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
- **Real-only parts:** a real audio player for the stored recording (instead of the flagged "Play recording"); a
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
- **Server not configured** (`src/app/error.tsx`): in production the practice page and the `(site)` pages still
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
- **Dashboard:** Recent attempts lists the same rows (the latest 4, real data, same row component; the flagged row menu
  sits beside each row) and "See all" links here. The rest of the dashboard is still mocked. If the attempts cannot be
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

Every page a tester walks through has a mock mode: the task list (`/?mock=1`), the practice page, the result
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

## Account menu (real pages)

`AccountMenu source="real"` asks `/api/account/me` (now `{ state, email, name }`, still no ids) and asks again after
every navigation. Signed in: name (the account's display name, else the part of the email before "@") and email, then
Log out. Not signed in: "Practising without an account", "Your answers are kept in this browser.", then Sign in and
Create account. Used in the practice page's rail / bottom bar and in the `(site)` header (`placement="header"`); the old
text header control (`AccountStatus`) is removed. Prototypes use `source="mock"`.

- **Checks:** `features/result/from-attempt.test.ts` (stored attempt → result page, retry "Goal met", development
  evaluator note, real player, every status, old method; comparison and error screens: one black button, no text under
  11 px). `e2e/practice-flow.spec.ts`: record → upload → evaluate (mock providers) → new result page → retry with goal →
  comparison → reopen from history; auto-start after preparation with the beep and "Speak now" (Playwright clock);
  upload failure, scoring failure, answer lost. `e2e/auth.spec.ts` uses the Account menu.
- Screenshots (1440 px and 390 px): `docs/design-system/practice-{real-result,real-retry-result,comparison,upload-failed,scoring-failed,answer-lost,server-unavailable,recording-speak-now,account-anonymous,account-signed-in}-{desktop,phone}.png`.
  Audited in the browser: no horizontal scroll, smallest text 11 px, one black button per screen.
