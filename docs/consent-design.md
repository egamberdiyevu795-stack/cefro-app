# Under-18 consent: design

Status: **decisions in section 0 (Asadbek, 2026-11-08). The pilot route (section 2b) is built on `claude/consent-pilot`;
the full design (sections 3–5) is not.** Replaces items 2–3 of
`docs/privacy-todo.md` ("guardian email", "email sending") with ways that need **no email**. Every legal point is for
the lawyer: see `docs/privacy-notice-draft.md` and `docs/terms-draft.md`, where each one is marked [CHECK].
Nothing here says any law applies; the age limit 18 is the owner's decision (teacher plan §7), pending that check.

## 0. Decisions (Asadbek, 2026-11-08)

- **Recording is locked until consent** (for under-18s: a parent's; see the pilot route for now).
- **Guests (no account) cannot record until consent exists.** Until the consent flow is built, nobody records
  without an account. After it, a guest records only once their age is known and, if under 18, a parent has agreed,
  which in practice means creating an account first. `docs/growth-plan.md` phase 2 follows this.
- **Waiting accounts** (under 18, no parent yet) are **deleted after 14 days**.
- **Audio is deleted 30 days after scoring**; the transcript and feedback are kept until the account is deleted. The
  lawyer may shorten this.
- **The parent page and the privacy notice in Uzbek and Russian** (English later); the rest of the app stays English
  for now.
- **Data controller for the pilot: Asadbek personally.** After the pilot: the lawyer's answer.
- Plan with **age 18**; **nobody under 14 is invited** until the lawyer answers the minimum age.
- Open for the lawyer, in this order: `docs/lawyer-questions.md`.

## 1. Options (no email sending)

| | Option | How it works | For | Against |
| --- | --- | --- | --- | --- |
| **A** | **Parent code** | The student's Account page shows a one-time code (8 characters, valid 7 days). The parent opens the parent page on **their own phone**, enters it, reads the short notice, types their name and relationship, ticks what they agree to, taps **I agree**. They then get a private **parent key** to keep (to see the status, withdraw, or delete later). | Free; works today; the parent reads the notice themselves; gives the parent a way to act without the student's password. | A student can fake it on a second browser. We can't verify who the parent is. |
| **B** | **Signed paper form via a teacher** | A printable form carries the student's code. The parent signs it; the teacher (owner-approved) collects it and enters the code in the class; consent is recorded as "paper, collected by teacher X". | Stronger evidence (a signature); fits schools and learning centres. | Only for students in a class; the teacher or school keeps the paper; more work for teachers; who holds the paper must be agreed. |
| C | Parent present at sign-up | "Hand the phone to your parent" on the same screen. | Easiest. | Weakest: a tick on the student's own phone. |
| D | SMS code to the parent's phone | A code sent by SMS through a local provider. | Checks a real phone number. | Costs per SMS; a new provider that receives phone numbers; a phone number doesn't prove parenthood either. |
| E | OneID / government ID | Parent signs in with a state ID service. | Strongest. | Heavy integration and approval; not for v1. |

## 2. Recommendation

**A (parent code) for every under-18 account, with B (paper via teacher) added later as an alternative route for
classes.** Under-18s can't record until consent is given. **For the pilot, neither is built**: consent is collected by
hand (section 2b). Ask the age as **month and year of birth** (enough to know
when someone turns 18, less than a full date). Whether A alone is enough evidence is the first question for the lawyer
[CHECK]; if not, B (or D) becomes required, and A stays as the parent's way to manage consent.

Why not wait for email: A needs no provider, and it gives the parent their own key, which email would not have solved
for parents without email. Email (or SMS) can be added later as a second way to deliver the same code.

### 2a. What a parent code does not prove

A parent code is **parental confirmation, not verified consent**. A student can open the parent page on their own
phone (or a friend's), enter the code and agree as their "parent". Age is also self-declared: a 15-year-old can type
a birth year that makes them 18, and then no parent is asked at all. Nothing in option A detects either. What reduces
the risk (none removes it):

- **Wording and responsibility:** the parent page says "Only a parent or legal guardian may agree"; the terms say a
  false age or a false parent leads to deletion.
- **Soft device check:** the parent page refuses a browser that is signed in as the student or carries the student's
  guest cookie ("Open this on your own phone"). Easy to get around, but it stops the casual case.
- **Visible to the family:** the student's Account page shows "Your parent (Dilnoza, mother) agreed on 08.11.26";
  the parent key is shown once and lets the real parent withdraw at any time.
- **Timing flag:** consent given within a minute of the code being made, from the same IP address, is flagged for
  the owner to look at (compared at the time; the IP address is not stored).
- **Age once:** month/year of birth is asked once, not editable by the student; a change needs the owner.
- **Stronger routes where it matters:** paper via a teacher (B) for classes, or a signed note collected by hand (the
  pilot route); teacher sharing can require one of these even if A is enough for practice.
- **Little to lose:** first name only for teachers, no phone number or address collected, audio deleted after 30 days.

Whether this is enough is lawyer question 2.

### 2b. Pilot route (about 10 known testers; built on `claude/consent-pilot`)

- **Who:** about 10 testers Asadbek knows personally. Nobody under 14. Adults and under-18s alike go through it.
- **How consent is collected:** by hand. Asadbek sends the parent the message in `docs/pilot-parent-message.md`
  (Uzbek, Russian, English; **not sent yet**, the Uzbek and Russian need a native speaker's check first) and keeps the
  parent's reply "yes" (a message or a signed paper note). Adult testers reply for themselves. Where and how long the
  replies are kept: lawyer question 6.
- **How it is recorded (built):** owner scripts, run by hand from Asadbek's own machine (they refuse to run on Vercel):
  - `node scripts/set-consent.mjs <email> granted [--teacher-sharing] [--notice <version>]` unlocks recording. It
    stores the date and **which text was agreed** (`consent_notice_version`, default the current parent message,
    `pilot-parent-message-2026-11-12c`). Teacher sharing stays off unless `--teacher-sharing` (the Teacher view is off
    in the pilot anyway).
  - `node scripts/set-consent.mjs <email> withdrawn` locks recording and teacher sharing again **at once**. The data is
    kept, so a mistaken withdrawal can be undone.
  - `node scripts/delete-account.mjs <email>` shows what would be deleted (dry run); `... <email> --yes` deletes the
    account and everything in it, exactly like "Delete my account" (a test checks they match), without the student's
    password. Use it when a parent withdraws and asks for deletion, as the parent message promises.
  - No page and no API can set consent (a test checks every route file).
- **Database (migration `0007_pilot_consent`, additive):** on `users`: `consent_status` (null = none, `granted`,
  `withdrawn`), `consent_at`, `consent_notice_version`, `consent_teacher_sharing` (0/1); on `recordings`:
  `audio_deleted_at`. Delete my account removes them with the row.
- **The lock (built):** one switch, `CONSENT_REQUIRED` (default `false`; set `true` in Vercel Production before inviting
  anyone). On: the upload and scoring routes refuse with 403 `consent_required` unless the account's status is
  `granted`; guests (no account) never record. The practice brief (Part 2 and Part 1) shows a kind lock instead of
  Start. Share and every teacher read also need `consent_teacher_sharing`. Part 3 has no real recording yet (mock only):
  when it goes live, it needs the same lock.
- **Account page (built):** a read-only "Recording consent" section while the switch is on: "Waiting for consent",
  "Consent recorded on 08.11.26" or "Consent withdrawn on 08.11.26", plus the 30-day audio rule. No age question, no
  parent page, no codes in the pilot.
- **Audio after 30 days (built):** a daily job (`/api/cron/audio-retention`, Vercel Cron at 03:17 UTC, needs
  `CRON_SECRET`) deletes the stored audio 30 days after scoring, wherever it is stored (`recording_blobs` rows on the
  hosted setup, files locally). Failed attempts, and attempts stuck before scoring, lose their audio 30 days after their
  last change. The recording row stays, marked, so the result page says "Recording deleted on …"; transcript and
  feedback stay. **Provider side:** audio is sent inline in the scoring request and never uploaded to a provider's file
  store (a test checks this), so CEFRO keeps no stored file there. That does **not** mean no copy exists: providers may
  keep request data for a limited time under their own terms, which we can't delete. Gemini's abuse-monitoring page
  (ai.google.dev/gemini-api/docs/usage-policies, checked 2026-11-08) says prompts and outputs are kept **55 days**, for
  paid use too; the free tier may also use content to improve Google's products, with human review, so **only made-up
  answers go to the free tier**. Gemini API **logging** (developer logs, up to 55 days, on by default for projects
  created from 26.10.26) would be a copy in our own project: keep it **off** (launch checklist, section 11). OpenAI, if
  used, has its own terms. Our promise is only about our own copy (lawyer question 12). **Vercel runs crons on the production deployment
  only**, so until the app is deployed to production nothing deletes audio on its own; nobody records before that
  anyway.
- **Not in the pilot:** deleting waiting accounts after 14 days (decision 4) needs the age question of the full design;
  in the pilot there are no self-sign-up minors, only invited testers.
- **Later:** the full design (sections 3–5) replaces the script; `consent_status` values from the pilot become
  `guardian_consents` rows with `method = 'by_hand'`.

## 3. Screens

**Sign-up** (`/register`): email, password, **month and year of birth** (two selects, required). 18+: unchanged.
Under 18: the account is created in **Waiting for a parent**, then a full screen: "Ask a parent to agree", the code in
large type, "Your parent opens **[parent page]** on their phone and enters this code. It works for 7 days.", Copy code,
grey "Continue to the demo". Until consent: practice, recording, Join a class are locked; demo pages work.

**Guests (no account)**: no recording (decision, section 0). Until the full flow exists the practice page shows
"Create an account to record". After it: before the first recording, the same month/year question; under 18: "Create
an account so a parent can agree first"; 18+: may record. The answer is stored on the anonymous row and carried into
the account on sign-up.

**Parent page** (`/parent`, no account needed, design system, phone first): enter code → "Your child wants to use
CEFRO" → plain summary (what is recorded and scored, who sees it, the scoring providers, teacher sharing, how to
withdraw) and a link to the full notice → your name, relationship (mother / father / guardian / other), two ticks:
**Practice and scoring** (required) and **Sharing with a teacher the student chooses** (optional) → **I agree**. Then:
the **parent key** (e.g. `PK-7Q4M-...`), "Keep this. With it you can see, change or withdraw your consent, and delete
the account." Later: `/parent` → enter key → status, scopes (untick teacher sharing), **Withdraw consent and delete
the account** (confirm card). Wrong codes / keys: 10 per hour per IP.

**Account page** (`/profile`), new section **Age and consent**:
- 18+: "18 or older". Under 18: "Under 18 · born 03.2010" (not editable; "Wrong? Contact us").
- Waiting: the code, its expiry, New code (old one stops), the parent page address.
- Given: "Your parent (Dilnoza, mother) agreed on 08.11.26. Teacher sharing: yes / no." Grey **Withdraw consent**
  (confirm card: "This deletes your account and everything in it"), reusing Delete my account.
- On the 18th birthday month: "You're 18 now. Agree for yourself" (one tap, new notice version); the parent key stops.
- Your classes / Join a class: hidden while waiting, or when teacher sharing is not agreed.

**Teacher Share screen** (S2): unchanged for 18+. Under 18 without teacher-sharing consent: no Share button; "A
parent needs to agree to teacher sharing first. They can turn it on with their parent key." Under 18 with it: **Name
your teacher sees** takes **a first name only** (one word, 1–30 characters); the "Will see / Won't see" list adds "Your
parent agreed to this on 08.11.26". Teachers never see age, birth month, parent details or consent records.

## 4. Data: collect, keep, delete

| Data | Who | Kept | Deleted |
| --- | --- | --- | --- |
| Month/year of birth | everyone, before first recording | while the account exists | with the account |
| Parent's name (as typed), relationship | under-18 | while consent stands | with the account, or on withdrawal |
| Consent record: method, scopes, notice version, date, teacher id (paper) | under-18 | while the account exists [CHECK: kept after deletion as proof?] | with the account, unless the lawyer says a minimal proof must stay |
| Codes, parent key | under-18 | **hashed only**; code until used / expired | with the account |
| Parent's phone number | **not collected** in A (no use for it without SMS) | — | — |
| Paper form (B) | school / teacher | by the school, not CEFRO [CHECK] | school's rule |
| Waiting accounts never agreed | under-18 | 14 days after sign-up [CHECK] | email, birth month, codes: whole account deleted |
| Recordings (audio) | after consent only | **30 days after scoring** (decision; lawyer may shorten) | automatically, or earlier with the account / withdrawal |
| Attempts, transcripts, feedback, results | after consent only | until account deletion | Delete my account or withdrawal |

Nothing about age or consent is sent to the scoring providers or shown to teachers.

## 5. Database changes (one additive migration, `0007_consent`, later)

- `users.birth_month` text `YYYY-MM`, null (null = not asked yet). `users.birth_month_set_at`. Set once by the user;
  changed only by an owner script.
- `guardian_consents`: `id`, `student_user_id`, `status` (`waiting` / `given` / `withdrawn` / `expired` /
  `superseded`), `method` (`parent_code` / `paper` / `self_at_18`), `code_hash`, `code_expires_at`,
  `parent_key_hash`, `guardian_name`, `guardian_relationship`, `scope_practice`, `scope_teacher_sharing`,
  `notice_version`, `recorded_by_teacher_id` (paper only), `given_at`, `withdrawn_at`, `withdrawn_by`
  (`guardian` / `student` / `owner`), `created_at`. At most one `waiting` or `given` row per student.
- One server check, `canRecord(user)` = 18+ by `birth_month`, or a `given` row. Used by recording and scoring routes
  (anonymous included). `canShareWithTeacher(user)` adds `scope_teacher_sharing`; Share and `teacherCanSee` use it, so
  turning teacher sharing off ends the share like Leave (teacher plan §5).
- `delete-account.ts`: delete `guardian_consents`; withdrawal calls it; a parent-key deletion calls it without the
  student's password. Add to the table-by-table test.
- A daily job deletes waiting accounts older than 14 days and audio (`recordings` audio + `recording_blobs` / files)
  30 days after scoring, keeping the `recordings` row marked "audio deleted" so results still show; the result page's
  player then says "Recording deleted after 30 days". It also marks a minor `adult` on their 18th birthday month.
- `class_members.shown_name`: one word for under-18s (server check).

Existing accounts: `birth_month` null → asked before their next recording; under-18 answers lock recording until
consent. Their past recordings: see open question 6.

## 6. Open questions: status

| # | Question | Status (2026-11-08) |
| --- | --- | --- |
| 1 | Is a parent code enough? | Lawyer. Pilot: written parent reply collected by hand |
| 2 | Age 18, minimum age? | Lawyer. Plan with 18; nobody under 14 invited meanwhile |
| 3 | Lock recording until consent? | **Decided: yes** |
| 4 | Delete waiting accounts after 14 days? | **Decided: yes** |
| 5 | Minimal consent record after deletion? | Lawyer. Owner's lean: date and notice version only, nothing about the person |
| 6 | Old under-18 recordings? | None exist (no real users yet) |
| 7 | Paper route in v1? | By hand for the pilot; not built |
| 8 | Data stored in Uzbekistan? | Lawyer, **asked first**: decides hosting, cost and timing |
| 9 | Data controller? | Pilot: Asadbek personally. After: lawyer |
| 10 | Audio retention? | **Decided: 30 days after scoring**, keep transcript and feedback |
| 11 | Uzbek and Russian? | **Decided: yes** for the parent page and notice |
