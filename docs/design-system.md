# CEFRO design system

Every new page (dashboard, feedback screen, lessons, tests) is built only from these tokens and components.
Tokens live in one file: `src/app/design-system.css` (a Tailwind v4 `@theme`, so each token is also a utility class,
e.g. `--color-card` → `bg-card`). Components live in `src/components/ds/`. The first page built on it is `/dashboard`.

The older pages (home, login, register, practice) still use the earlier tokens in `globals.css` until they are redone.

## Merge order (read before merging)

- This branch (`claude/design-system-dashboard`) was cut from PR #5's branch (`claude/friendly-darwin-l73xx9`), because
  `claude/advice-task-scoring` did not exist on GitHub. **Merge it only after PR #5.**
- **`claude/part1-player` must be rebased after this branch merges.** It adds `src/app/dev/part1-player/`. Because
  the old header moved out of the root layout into `src/app/(site)/layout.tsx`, that page would otherwise render
  without the header: move it to `src/app/(site)/dev/part1-player/` while rebasing (its URL stays `/dev/part1-player`).
  Any other branch that adds or edits files under `src/app/` needs the same check.

### Files the route-group move touched

The existing pages moved into the `(site)` route group so `/dashboard` can have its own shell. URLs did not change and
the moved files are byte-for-byte identical (git shows them as 100% renames).

| Change | File |
| --- | --- |
| moved | `src/app/page.tsx` → `src/app/(site)/page.tsx` |
| moved | `src/app/login/page.tsx` → `src/app/(site)/login/page.tsx` |
| moved | `src/app/register/page.tsx` → `src/app/(site)/register/page.tsx` |
| moved | `src/app/practice/speaking/[taskId]/page.tsx` → `src/app/(site)/practice/speaking/[taskId]/page.tsx` |
| added | `src/app/(site)/layout.tsx` (the skip link, header and `<main>` that used to be in the root layout) |
| edited | `src/app/layout.tsx` (now only `<html>`, `<body>` and fonts; adds Inter) |
| edited | `src/app/globals.css` (imports `design-system.css`; its own tokens unchanged) |

API routes (`src/app/api/**`) did not move.

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
- **First visit** (no attempts yet): no level, no chart, no list. "Welcome to CEFRO", "Find your level" with a
  "Start your first practice" button, countdown*, and the four exam part tiles (all "Start"; four in a row on desktop).
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
| `PillButton` | Pill link. `primary` = near-black (main action, e.g. "Start retry"); `quiet` = grey well (e.g. "View report"); `light` = card-white, for pills that sit on a `well` surface. Sizes `md` (36 px, 13 px text) and `sm` (28 px, 12 px text). Optional leading icon and `label` (accessible name when the visible text repeats, e.g. "Practise Part 2"). |
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
| `ComingSoonButton`, `ComingSoonMenu`, `ComingSoonToast` | Future controls behind a feature flag. The button takes the real control's classes (from `styles.ts`), so it looks identical; tapping it shows the toast. The menu is a ⋮ button with a small card menu whose items all say "Coming soon" (closes on Escape or outside tap). The toast is one small near-black pill ("Coming soon") near the bottom, a polite live region; mount it once per page. |
| `styles.ts` | Shared class strings (focus ring, icon button, nav item, text actions), so server and client components render a control the same way. |
| `Icon` | The icon set (24 px grid, currentColor). Add new glyphs here in the same style. |
