# Under-18 consent: design

Status: **proposal, 2026-11-08. Nothing built.** Documents only: no app code, no migration. Replaces items 2–3 of
`docs/privacy-todo.md` ("guardian email", "email sending") with ways that need **no email**. Every legal point is for
the lawyer: see `docs/privacy-notice-draft.md` and `docs/terms-draft.md`, where each one is marked [CHECK].
Nothing here says any law applies; the age limit 18 is the owner's decision (teacher plan §7), pending that check.

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
classes.** Under-18s can't record until consent is given. Ask the age as **month and year of birth** (enough to know
when someone turns 18, less than a full date). Whether A alone is enough evidence is the first question for the lawyer
[CHECK]; if not, B (or D) becomes required, and A stays as the parent's way to manage consent.

Why not wait for email: A needs no provider, and it gives the parent their own key, which email would not have solved
for parents without email. Email (or SMS) can be added later as a second way to deliver the same code.

## 3. Screens

**Sign-up** (`/register`): email, password, **month and year of birth** (two selects, required). 18+: unchanged.
Under 18: the account is created in **Waiting for a parent**, then a full screen: "Ask a parent to agree", the code in
large type, "Your parent opens **[parent page]** on their phone and enters this code. It works for 7 days.", Copy code,
grey "Continue to the demo". Until consent: practice, recording, Join a class are locked; demo pages work.

**Anonymous visitors**: before the **first recording** (not at page load), the same month/year question. Under 18:
"Create an account so a parent can agree first", no recording. 18+: unchanged. The answer is stored on the anonymous
row and carried into the account on sign-up.

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
| Recordings, attempts, results | after consent only | until account deletion (today's rule) [CHECK a fixed period] | Delete my account or withdrawal |

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
- A daily job (or check on read) deletes waiting accounts older than 14 days, and marks a minor `adult` on their 18th
  birthday month.
- `class_members.shown_name`: one word for under-18s (server check).

Existing accounts: `birth_month` null → asked before their next recording; under-18 answers lock recording until
consent. Their past recordings: see open question 6.

## 6. Open questions for you

1. **Is a parent code (A) enough evidence**, or must we have paper (B) or SMS (D)? (Lawyer.)
2. **Age limits:** is 18 the right age for consent here, and is there a minimum age below which no one may use
   CEFRO even with consent (e.g. under 14)? (Lawyer, then you.)
3. **Locked until consent?** I recommend no recording before consent. Alternative: record and score, delete after 14
   days without consent. Which?
4. **Waiting accounts:** delete after 14 days? Another period?
5. **Proof after deletion:** keep a minimal consent record (date, method, notice version, no name) after an account
   is deleted, or delete everything? (Lawyer.)
6. **Existing under-18 data** recorded before this ships: lock it until a parent agrees, or delete it?
7. **Paper route (B):** build it in v1 for schools, or later? If yes, who keeps the signed forms?
8. **Where data is stored:** the hosted database (Turso) and providers are outside Uzbekistan; the lawyer must say
   whether data of citizens of Uzbekistan must be stored on servers in Uzbekistan [CHECK]. This may decide hosting
   before launch.
9. **Who is the data controller** (your name, a company, a school)? The drafts leave it blank.
10. **Retention of recordings:** keep until the account is deleted (today), or delete audio after a fixed time
    (e.g. 12 months) and keep only text results?
11. **Languages:** the parent page and notice in Uzbek and Russian as well as English? (Probably required for
    parents to understand it [CHECK].)
