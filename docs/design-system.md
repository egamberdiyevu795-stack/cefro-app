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
welcome card's "Start your first practice" (it goes to the recommended part, Part 2). All part tiles use the white tile pill.

## Feature flags

Elements that are designed but not built are kept in the design behind flags in `src/config/features.ts`:
notifications (bell), search, Mock exam link, "Last 30 days" filter, sidebar Lessons / History / Settings, the attempt
row menu (Delete, Report a wrong score) and the exam date countdown. ("See all" on Recent attempts follows `history`,
since it leads there.)

- **Flag on** (prototype default): the element is shown exactly as designed; tapping it shows a small "Coming soon".
- **Flag off:** the element is not rendered. Neighbours fill the space (e.g. "Practise next" takes the full row when
  the countdown is off; the search row disappears on phones).
- Preview with every flag off: `/dashboard?flags=off`. Turn flags off before a page ships; delete a flag when its
  feature is real.

## Dashboard states

- **Returning** (has attempts): Practise next, exam countdown*, Speaking progress + radar, Exam parts, Recent
  attempts, Biggest fix. Phone order: Practise next, countdown*, progress, biggest fix, radar, recent attempts, exam parts.
- **First visit** (no attempts yet): no level, no chart, no list. "Welcome to CEFRO", "Find your level" with the black
  "Start your first practice" button (goes to Part 2) and a small "When is your exam? · Add date" prompt*, then the four exam part tiles
  (four in a row on desktop). Part 2 is recommended: a small "Recommended" label and "Start with Part 2 · shows your
  level fastest"; all four tiles use the same white tile "Start" pill.
- **Account** (with Log out) is always in the nav, whatever the flags. It opens a small menu: name and email, then Log
  out (the app's real sign-out endpoint, then the sign-in page). On the dashboard and result prototypes the account is
  mocked; on real pages it is the signed-in student's (see "Account menu" below).
- **Practise next** opens its task directly. The task is mocked, so it opens a mock route,
  `/dashboard/task/a-skill-you-learned`, which stands in for the real task screen.
- Toggle: `DASHBOARD_STATE` in `src/features/dashboard/mock-data.ts`, or `/dashboard?state=first-visit`.
- Screenshots: `docs/design-system/dashboard-{normal,first-visit,flags-off}-{desktop,phone}.png`.

\* flagged.

## Levels and bands

- An overall **level** is a CEFR level (Below B1, B1, B2, Above B2). The top of the dashboard shows only the level and
  the target ("B1 · target B2"), and a measurable goal ("2 of 4 skills at B2": assessed skills at B2 or above; a
  skill that was not assessed is not counted). Never a band there.
- A **band** (0–5) belongs to one exam part, and each part has its own band table (Part 2: 3 = Lower B2,
  4 = Higher B2; Part 1.2: 3 = Lower B1, 4 = Higher B1). So a band is always shown with its part and its label
  ("Part 2 · Band 2 · Higher B1") and only in the Exam parts tiles. Lists show the level of each attempt as
  the main value. There is no Passed/Failed; the only status is "Scoring…" while an answer is being processed.
- The dashboard mock data is checked against the real Part 2 scorer by `src/features/dashboard/mock-data.test.ts`.
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
- **New flags:** `fixLesson`, `recordingPlayback`. **New icons:** `play`, `partly`, `cross`. **New style:** `PILL_QUIET`.
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
  also plays one short beep (`lib/chime.ts`, Web Audio, no sound file; allowed because "Start preparation" was
  clicked), shows "Speak now" beside "Recording" for 4 s and announces "Recording started. Speak now." to screen
  readers. Same when the student skips with "Start speaking now". The beep plays first and recording starts when it
  ends (0.4 s), so the beep is never recorded (as the Part 1 plan requires for its chime). Sound failures are ignored.
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
