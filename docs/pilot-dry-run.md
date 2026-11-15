# Pilot dry run: a 30-minute rehearsal on two laptops

For: Asadbek and a friend. Written 2026-11-12 on `claude/pilot-ready`. Do this **before** the real pilot, on a Vercel
**Preview** with its **own test database** and **fake accounts only**. Nothing here touches Production or real students.
Follow `docs/pilot-runbook.md` for what each step means; this page is the rehearsal of it.

**What you rehearse:** create a teacher, a class and two students; record their consent; run the exam laptop on two laptops;
two full mocks at the same time; the teacher listens and rates; the students see their results.

**The 30 minutes are about 30 to 35 in practice:** the two mocks run in parallel and take about 15 minutes by themselves
(the timers cannot be shortened). Everything else is set up around them.

**Rules for the rehearsal**

- Fake emails only (`teacher.test@example.com`, `student.one@example.com`, `student.two@example.com`). No real name, email,
  voice of a real student or parent.
- Say made-up answers (your own words about anything). Never read out real personal details.
- The database is the **test** one. If you are not sure, stop.

---

## A. Prepare once (not counted, about 30 minutes, you alone)

1. **A second Turso database for the test** (turso.tech → create a new database, named for example `cefro-test`). Never the
   production one. Make a URL and a token for it.
2. **Vercel → Settings → Environment Variables:** add these for **Preview only** (untick Production and Development):

| Name | Value |
| --- | --- |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | the **test** database's |
| `CEFRO_ALLOW_PREVIEW_TURSO` | `true` (says "these Preview credentials are a different database") |
| `AUTH_SECRET` | 32+ random characters, **different** from Production |
| `TRANSCRIPTION_PROVIDER` | `openai` |
| `OPENAI_API_KEY` | your key (a real recording costs a few cents) |
| `EVALUATION_PROVIDER` | `gemini` (leave `GEMINI_API_KEY` unset to rehearse "AI score not ready yet", the pilot's likely state) |
| `CONSENT_REQUIRED` | `true` |
| `CRON_SECRET` | any 16+ characters (crons do not run on Previews; the setting just avoids a warning) |
| `TEACHER_LIVE` | `true` |
| `FULL_MOCK_LIVE` | `true` |

3. **GitHub → the repository → Settings → Secrets and variables → Actions → Variables:** add `CEFRO_ALLOW_PREVIEW_TURSO` =
   `true`. **Without this the production deploy pipeline refuses to continue** when Preview holds database credentials
   (`docs/DEPLOY_VERCEL.md`, "Which variables the check reports"). If you later delete the Preview variables, you may remove it.
4. **Migrate the test database** by hand (the pipeline never touches it). In a **new** Terminal window, in the `cefro-app`
   folder on branch `claude/pilot-ready`, with only the **test** values:

```bash
export TURSO_DATABASE_URL='libsql://...test-database...'
```

```bash
export TURSO_AUTH_TOKEN='...test-token...'
```

```bash
npm ci && npm run db:migrate -- --require-remote
```

   Expect `11 migrations applied` (0000 to 0010). Keep this window open for step 2 of the rehearsal; do not mix it with a
   window that has production values.
5. **The Preview itself:** Vercel → **Deployments** → the Preview for branch `claude/pilot-ready` (it builds when the branch is
   pushed; Redeploy it after adding the variables, with "Use existing Build Cache" unticked) → **Visit**. Copy its address.
   If Vercel asks your friend to log in, use Vercel's **Share** option for that deployment (Deployment Protection) or
   switch protection off for this one test.
6. **Two laptops**, each with **Chrome** and a working microphone (a headset is better), in two rooms (or two far corners
   with headsets). One phone each for you and your friend, ideally one of them an **iPhone** (it is also the iOS test,
   `docs/launch-checklist.md`, section 12, item 3).

---

## B. The rehearsal, minute by minute

Roles: **You** are the teacher (Azamat) and the person at the Terminal. **Your friend** is Student Two. You are also
Student One, by turns. Laptop 1 is yours (Room 1), laptop 2 is your friend's (Room 2).

| Min | Who | Do | You should see | If not |
| --- | --- | --- | --- | --- |
| 0–3 | You, phone or laptop | Open the Preview address → **Register**: `teacher.test@example.com` (any password of 8+ characters). Then register `student.one@example.com`. Friend registers `student.two@example.com`. | Each lands signed in. | An error page: a variable is missing (`docs/pilot-runbook.md`, section 1). |
| 3–5 | You, Terminal (test values) | `node scripts/set-role.mjs teacher.test@example.com teacher` | `… is now a teacher.` | "no registered account": the email differs from the sign-up. |
| 5–6 | You, Terminal | `node scripts/set-consent.mjs student.one@example.com granted --teacher-sharing` and the same for `student.two@example.com` | A line saying consent was recorded. | "no registered account" again. |
| 6 | Friend, phone | **Lock check:** register a third account `student.three@example.com` and give it **no** consent. Open **Practice** → the full mock. | A kind "recording is locked" message instead of a start button. | If that account can record, `CONSENT_REQUIRED` is not `true`. Stop. |
| 6–8 | You as teacher: sign in again (sign out first) | **Home** now has **Your classes** → **Create class** → name it `Dry run` → the 6-character code. | The code, large. | No **Your classes**: the role command did not work, or `TEACHER_LIVE` is not `true` (Redeploy). |
| 8–10 | Both students, phone | **Account** → **Join a class** → the code → type **Student One** / **Student Two** as **Name your teacher sees** → set a **class PIN** (Student One `1111`, Student Two `2222`; dry run only) → **Share with this teacher**. | The class shows under **Your classes** with "Class PIN: set". On your class page both names appear. | A student who cannot Share: consent was recorded **without** `--teacher-sharing`. |
| 10–11 | You, laptop 1 | Sign in as the teacher → the class → **Start exam laptop** → **Same paper for everyone** → name `Room 1` → the black button. | The student list "Tap your name" with both students "Not started". You are signed out of this browser. | A message about the full mock: `FULL_MOCK_LIVE` is not `true`. |
| 11–12 | Friend, laptop 2 | Sign in as the teacher (give your friend the fake teacher's password) → the class → **Start exam laptop**. | It now says **Join Mock 1**. Name it `Room 2`, press it. | It offers a new paper instead of joining: the first laptop did not start; go back one row. |
| 12–14 | Friend, laptop 2 | **Lock test:** tap **Student One**, type a **wrong** PIN (`0000`) five times. | "That PIN isn't right. 4 tries left" … then "Too many wrong PINs. Ask your teacher to unlock you." Student One shows "Locked. Ask your teacher." on laptop 2 only. | On laptop 1 Student One must still be pickable. |
| 14 | Friend, laptop 2 | **Teacher options** (small text) → **Unlock Student One** → fake teacher's email and password. | "Student One is unlocked." (the name each student chose) | Wrong password counts as a failed sign-in. |
| 14–15 | You, laptop 1 / Friend, laptop 2 | You tap **Student One** on laptop 1 → PIN `1111`. Friend taps **Student Two** on laptop 2 → PIN `2222`. | "Hi …, this mock is saved to your account", the **Before you start** card. Press **Check microphone** (allow it), then **Start mock**. On the other laptop the list shows the first student **In progress (Room 1)** and cannot be picked. | A microphone problem: check the browser's site settings. |
| 15–30 | Both | **The two mocks run**, about 15 minutes. Speak real sentences in English (about 10+ words per answer; silence is not scored). Do not touch anything. **While they run, use a third device (a phone) as the teacher**: sign in, class page → **Class mocks** card shows the mock; open it: **In progress** rows. | The spoken introductions play; "Part N of 4"; beeps. | A part says **"Send again"**: connection problem; press it. |
| ~30 | Both laptops | When each mock ends: | **"Done. Your results will be on your phone."** and **no level or band on the screen**. The list returns by itself after 20 seconds. | If a result is visible on the shared laptop, **stop and report it**: that is a real bug. |
| 30–32 | You, laptop 1 | Try typing another address in the address bar, for example `/dashboard`. | "Page not found". The laptop cannot reach anything but the list. | Anything else opening is a real bug. |
| 32–33 | You, laptop 1 | **Teacher options** → email and password → **End exam laptop**. Friend does the same on laptop 2, choosing **End and close the class mock**. | You are signed in as the teacher again, on the class page. | |
| 33–36 | You, phone (teacher) | Class → **Class mocks** → the mock → **Open first unrated** → for each part: play it (try 1.5×), read the transcript, **Choose level** (or **Agree** if the AI side shows a band). Give "Your level for this mock". Then the second student. | Both students listed with levels or "AI score not ready yet"; the player plays; there is no download button. | If you hear nothing, the audio failed to upload: note which part. |
| 36–38 | Both students, phone | Sign in → **History** → the mock row (it says **In class**). Open it. | Their transcript with mistakes and better versions, the AI side (or **"AI score not ready yet"**), and **"Your teacher: …"** next to it. | |
| 38–40 | You | **Leave test:** Student Two → **Account** → **Your classes** → **Leave**. Then on the teacher's phone try to open Student Two's mock. | The teacher loses it at once (page not found). | |

The lock/leave tests are extras; if the minutes run out, do them last.

---

## C. Record what happened

Copy this and fill it in (a message to yourself is fine):

- Date, Preview address, branch commit (Vercel shows it).
- Each row above: passed / failed / not tried.
- How long each mock took, per student; whether any part said "Send again".
- Whether the transcript looked right (read three answers against what was said).
- Anything the teacher found confusing; anything the students found confusing.
- Any real bug: exactly what was on the screen, and the time.

A real bug is: a result or level on the shared laptop; another address opening on the laptop; a student recording into the wrong account;
the teacher hearing a student who did not share; a mock that cannot be continued.

## D. Clean up

1. Delete the **test database** in Turso (or, if you want to keep it for the next rehearsal, run
   `node scripts/delete-account.mjs <email> --yes` for each fake account).
2. Close the Terminal window that held the test values.
3. Keep or remove the Preview variables as you like. If you remove the Preview `TURSO_*` values, the GitHub variable
   `CEFRO_ALLOW_PREVIEW_TURSO` is harmless to keep.
4. Do **not** copy any of these values into Production. Production gets its own, in `docs/pilot-runbook.md`.

If every row passed, the pilot's setup is ready; the open items in `docs/launch-checklist.md`, section 12, are what is left.
