# Growth plan: from first visit to a saved account

How a new visitor becomes a student with an account. Each phase ships on its own; a later phase never starts before
the one it depends on.

| Phase | What | Depends on | Status |
| --- | --- | --- | --- |
| 1 | Signed-out pages redesign | — | Built (`claude/landing`) |
| 2 | Guest tries one real answer, then "Save your result" | Under-18 consent work | Not started |
| 3 | One-tap sign-in (Google or Telegram) | Phase 1 | Not started |
| 4 | Full mock exam | All three parts live | Not started |

## Phase 1: signed-out pages redesign

Home (`/`), sign in (`/login`) and Create account (`/register`) on the design system only
(`docs/design-system.md`, "Signed-out pages").

- **Home** says what the app does for the whole exam: answer exam-style questions out loud, see your own words quoted,
  fix one thing and try again. One black button, "Start practising" (to Create account); a grey "See a demo result"
  opens a real demo result in mock mode (`/result?demo=demo-5&mock=1`). Three steps show the loop. A small status
  list says which exam parts are open, read from the same release switches as the dashboard (`PART_LIVE` in
  `src/config/features.ts`), so it can never be wrong.
- **Create account** asks only for email and password ("Save your results"). The name is set later on the Account page.
- **Sign in**: "Welcome back".
- No numbers, ratings, testimonials, "free" claims, Passed/Failed or claims about age.

## Phase 2: guest tries one real answer, then "Save your result"

A visitor records one real answer without an account and sees the real result; the result page then offers "Save
your result" (Create account), and the answer moves into the new account (the server already merges the anonymous
identity into the account at sign-up).

**Blocked by the under-18 consent work** (`docs/privacy-todo.md`): a guest's recording is personal data of someone
whose age we do not know, so it can only be stored once the consent flow for under-18s exists.

## Phase 3: one-tap sign-in (Google or Telegram)

"Continue with Google" and/or "Continue with Telegram" on sign in and Create account, beside email and password.
Needs: the provider apps and their secrets (environment variables), the auth library's social sign-in, the same
rate limits, and the same rule that a name is never made from an email (a provider's display name is only a
suggestion on the Account page). Still one black button per screen: the provider buttons are grey.

## Phase 4: full mock exam

"Full mock exam": Parts 1, 2 and 3 in order, as in the real exam, then one overall result. Starts only **after all
three parts are live** (`PART_LIVE` all on), since it reuses each part's practice flow and scoring. The dashboard's
"Mock exam" link (flag `mockExam`, now "Coming soon") becomes the real entry point.
