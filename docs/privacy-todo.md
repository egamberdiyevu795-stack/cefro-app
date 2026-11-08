# Privacy to-do: under-18 consent

**Status (2026-11-08): the pilot route is built on `claude/consent-pilot`** (consent recorded by the owner's script,
recording locked until then, guests never record, owner deletion script, audio deleted 30 days after scoring); see
`docs/consent-design.md`, section 2b. The full under-18 flow below (age, parent code, parent page) is **not built**.
Originally this listed what the under-18 consent work will need from the Account page (`/profile`, Profile
and Settings merged; `/settings` redirects there) added on `claude/profile-settings`, and from the microphone check on
the practice brief. Nothing here is implemented yet, and nothing on those pages
asks for an age or a guardian today. Legal points are to be confirmed with a lawyer before building.

## What the two pages hold today

| Section | Personal data shown or changed | Stored where |
| --- | --- | --- |
| Account · Your account and Your exam | Name (editable), email (shown), exam date, current level, member since, number of attempts | `users` (name, email, exam_date, exam_date_skipped_at, created_at); levels from `evaluations` |
| Practice brief · Check microphone | A 3 s recording | **Nowhere.** A blob URL in the browser tab only; never uploaded, gone when the page closes |
| Account · Change password | Password | `auth_accounts.password` (scrypt hash, by the auth library) |
| Account · Delete my account (password + DELETE) | Everything above, plus every attempt, recording, transcript and result | Deleted from every table and from the audio storage (see below) |

**Where recordings are stored** (`src/server/storage/index.ts`, `AUDIO_STORAGE_PROVIDER=auto`): on the hosted setup
(Turso configured, i.e. Vercel Production) in the database table `recording_blobs`; otherwise (local development, a
self-hosted server) as files under `AUDIO_STORAGE_DIR` (default `./data/audio`). Each `recordings` row names its
provider and key. Audio is also sent **inline** (not uploaded as a stored file) to the transcription and evaluation
providers when an answer is scored; their own retention rules apply and are not controlled by "Delete my account".

## What consent will need from the Account page (name, level, exam date)

1. **Age.** A way to know a student is under 18: a date of birth or an "I am under 18" answer, asked once (at sign-up
   or on first practice), shown on the Account page and not freely editable afterwards (changing it to 18+ must not silently
   lift consent). Needs a **database migration** (a column on `users`, or a separate table).
2. **Guardian.** For an under-18 account: the guardian's name and email, the consent status ("Waiting for consent",
   "Consent given on dd.mm.yy", "Consent withdrawn"), and when and to which version of the notice it was given. Shown
   on the Account page; the student can't mark it given themselves. Needs a **consent record** (who, when, notice version,
   how it was given), so another migration or the same one.
3. **Email sending.** Asking a guardian needs an email (with a link to confirm). CEFRO sends no email today (emails
   are not verified either, see `docs/ARCHITECTURE_DECISIONS.md`), so a provider and verification come first.
4. **Name.** The name field is free text. For under-18 accounts consider asking for a first name only.

## What consent will need from the Account page (password, sign-out, deletion) and the microphone check

1. **Withdraw consent.** A guardian (or the student) withdrawing consent should lead to the same full deletion as
   "Delete my account" (`server/account/delete-account.ts`, reuse it). That deletion must then also remove the age,
   guardian and consent records added above (add them to the function and to its test).
2. **Delete my account for a minor.** Decide whether a guardian can request it without the student's password, and
   whether the guardian gets a confirmation email once it is done. (Today deletion needs the account's password and
   DELETE typed.)
3. **Change password.** No change expected, but a guardian-initiated reset needs the email sending above.
4. **Check microphone** (practice brief). No change: nothing is stored or sent, so no consent is needed for it beyond the browser's own
   microphone permission. Keep it that way (a test that it never uploads is in `e2e/profile-settings.spec.ts`).

## Gaps found while building these pages (not consent, but related)

- **Recording before an age is known.** Anyone can practise without an account (an anonymous identity in a cookie),
  so a minor's voice can be stored before any age question. **Decided and built for the pilot:** with
  `CONSENT_REQUIRED=true` guests never record, and accounts record only after the owner recorded consent.
- **No deletion without an account.** "Delete my account" needs a signed-in account. An anonymous browser's attempts
  and recordings can't be deleted from the app (only by signing up, then deleting). Consider a "Delete this browser's
  practice" for anonymous visitors.
- **No data export.** There is no way to download one's own data (attempts, transcripts, recordings).
- **Third-party copies.** The privacy notice must say that audio and transcripts are sent to the scoring providers.
- **Logs.** "Account deleted" is logged with counts only (no email or id). Server logs may still hold request
  metadata for their own retention period.
- **Uzbekistan law.** Check the Law on Personal Data (including its rule on storing citizens' personal data on
  servers in Uzbekistan) and the age of consent it uses, before choosing where the hosted database and recordings live.
