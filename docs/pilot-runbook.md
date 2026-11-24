# CEFRO pilot runbook

For: Asadbek (owner). Written 2026-11-12 on `claude/pilot-ready`. Plain English; no programming needed, only copying
the commands shown. Read it once from top to bottom, then follow it in order.

**The pilot:** one teacher (Azamat) at our language centre, about 10 students, one or two laptops in quiet rooms.
Students take the full speaking mock one at a time on the exam laptop. AI scoring may be off (no Gemini credit yet):
then every result says **"AI score not ready yet"**, the transcript and the recording are saved, and **Azamat's level
carries the pilot**. When credit arrives, the AI side fills in later (`docs/v1-plan.md`, step 9).

**Nothing in this file has been done.** Nothing is merged, deployed or switched on. Each part says who does it.

---

## 0. Before you start: four things that must be true

| # | What | Who | Where |
| --- | --- | --- | --- |
| 1 | The code is merged into `main` and deployed to Production. **You have not decided this yet.** The exact order is in `docs/merge-order.md`, section "Pilot-ready: the exact merge order". | You | `docs/merge-order.md` |
| 2 | The open items are closed: the iPhone test (the Piper credit is now on the Credits page). | You | `docs/launch-checklist.md`, section 12 |
| 3 | Nobody in the pilot is under 14. | You | `docs/consent-design.md`, section 0 |
| 4 | You did the 30-minute dry run with a friend and it passed. | You and a friend | `docs/pilot-dry-run.md` |

**Words used here.** *Vercel* is where the app runs (vercel.com, your project). *Turso* is where the data is kept
(turso.tech). *Terminal* is the text window on your own computer where you paste commands (on a Mac: the Terminal app).
*Production* is the real app that students use. *Redeploy* is a button in Vercel that restarts the app with new settings.

---

## 1. Settings in Vercel (environment variables)

**Where:** vercel.com → your project → **Settings** → **Environment Variables** → **Add**. Type the name exactly, paste the
value, tick **Production only** (untick Preview and Development), **Save**. For anything secret, switch on **Sensitive**.

**After you change or add any variable, press Redeploy**, or nothing changes: **Deployments** → the newest Production
deployment → the three dots → **Redeploy** → untick "Use existing Build Cache" → **Redeploy**. No new commit is needed.
Settings are read when the app starts.

### 1a. What the pilot needs

| Name | Value | What it does | Where to get it |
| --- | --- | --- | --- |
| `CONSENT_REQUIRED` | `true` | Locks recording until you have recorded consent for that person. Default is `false` (no lock), so **you must set it**. | Nothing to get. Type `true`. |
| `CRON_SECRET` | 16 or more random characters | Lets Vercel run the daily job that deletes recordings 30 days after scoring. **Without it the job refuses to run and no audio is ever deleted.** | Make one. In Terminal: `openssl rand -base64 32` and copy the result. |
| `TRANSCRIPTION_PROVIDER` | `openai` | Turns each recording into text (the transcript Azamat reads). | Nothing to get. Type `openai`. |
| `OPENAI_API_KEY` | a key starting `sk-` | The paid speech-to-text service. A small cost per minute of audio. | platform.openai.com → sign in → **API keys** → **Create new secret key**. Add some billing credit there first. Copy the key once; it is shown only once. |
| `EVALUATION_PROVIDER` | `gemini` | **Must be set on Vercel even if you have no scoring key**, or the app refuses requests. With no key, the AI side simply says "AI score not ready yet". | Nothing to get. Type `gemini`. |
| `TEACHER_LIVE` | `true` | Switches on the Teacher view: classes, join codes, the exam laptop, listening to recordings. | Nothing to get. Type `true`. |
| `FULL_MOCK_LIVE` | `true` | Switches on the full mock exam (all four parts in one go). **Needed by the exam laptop**: without it Start exam laptop is refused with a message. The single parts can stay "Coming soon". | Nothing to get. Type `true`. |

These must already be set from before (check they are there): `AUTH_SECRET` (32+ random characters, signs logins),
`TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` (the database; Production only). If one is missing the app tells you in
Vercel's logs which one.

### 1b. Optional

| Name | Value | What it does | Notes |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | a Google AI key | Turns on AI scoring and the pronunciation step. | aistudio.google.com → **Get API key**. Needs credit. Also check "request logging" is **off** for the project (`docs/launch-checklist.md`, section 11, item 5). |
| `ANTHROPIC_API_KEY` | a key | Only if you set `EVALUATION_PROVIDER=anthropic` instead of Gemini. | console.anthropic.com → API keys. |
| `PART_1_1_LIVE` | `true` (default) | Part 1.1 practice at home (questions from the weighted bank). **Live by default since 2026-11-15** (owner: no manual Vercel step); set `false` to close it. | **Live:** the six Part 1 anchors scored exactly, twice, on gemini-3.8-flash. |
| `PART_3_LIVE` | `true` (default) | Part 3 practice at home. **Live by default since 2026-11-15**; set `false` to close it. | **Live:** first anchor run 7 of 11 exact, all within one band; after the weak-answer fix (argument-evaluator 0.3.0) the 4 low/middle anchors rerun 4 of 4 exact (docs/part3-topic-bank.md). |
| `PART_1_2_LIVE` | `true` | Opens Part 1.2 for practice at home. Default off ("Coming soon"). | **Not yet:** six picture tasks since 2026-11-21 (enough to open), but the Part 1.2 anchors still have to be rerun after the Question 4 rule change of 2026-11-15 (evaluator 3.8.1). The rerun on 2026-11-21 could not score: Gemini credits were depleted (HTTP 402). |
| `PART_2_LIVE` | `false` | Closes single Part 2 practice. Default is on. | Normally leave it alone. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` | Gmail settings | Switches on **Forgot password?** (the reset link is emailed). Without them the link is simply not shown. | Step by step in `docs/password-reset.md` (a new Gmail account with an app password, about 10 minutes). |

How the switches read: only the words `true` or `1` (on) and `false` or `0` (off) count, in any capital letters. Anything
else (a typo, "yes") is ignored and the default is used, which is **off**. If a switch seems to do nothing, check the
spelling first.

### 1c. Do not set these in Production

`CEFRO_TEST_CLIENT_IP`, `CEFRO_TEST_PART3_LIVE`, `CEFRO_TEST_FULL_MOCK_LIVE`, `CEFRO_TEST_TEACHER_LIVE`,
`CEFRO_ALLOW_PREVIEW_TURSO`, and nothing that starts with `NEXT_PUBLIC_` that is a secret. (The `CEFRO_TEST_` switches are
ignored in Production anyway.)

### 1d. If you have no scoring key: one red mark is normal

Without `GEMINI_API_KEY` the app records, transcribes and shows results, but its health page (`/api/health`) says
"unavailable" on purpose, so a missing scoring key is reported loudly. The last step of the **Deploy production** run on
GitHub ("Health check of the new release") will show **red**. The deploy itself has finished; nothing is rolled back.
Students and teachers are not affected. It turns green when a scoring key is added. (`src/server/config/boot-check.ts`.)

### 1e. Check it worked (2 minutes, after Redeploy)

1. Open the app address (today `https://cefro-app-mgm6.vercel.app`) on your phone and sign in as a student.
2. The **Practice** page shows a **Full mock exam** card (not "Coming soon").
3. Vercel → project → **Settings** → **Cron Jobs**: `/api/cron/audio-retention` is listed, daily at 03:17 UTC. (Vercel runs
   crons on Production only, never on Previews.)
4. A student you have not recorded consent for sees a kind "recording is locked" message instead of a Start button. That is
   the lock working.

---

## 2. Migrations (the database update): one command

The app refuses to start on a database that is behind, so **update the database before deploying the new code**. The
changes are additive (nothing is deleted or rewritten), and the app that is live now keeps working on the updated database.

**Take a Turso backup first** (Turso dashboard → your database → create a restore point / backup; if you are unsure how,
ask before going on).

On your own computer, in Terminal, in the `cefro-app` folder, with the latest `main`:

```bash
git checkout main && git pull && npm ci
```

Give the terminal the database address and key (from the Turso dashboard; the same two values as in Vercel). Never paste
them into a chat or a file:

```bash
export TURSO_DATABASE_URL='libsql://...'
```

```bash
export TURSO_AUTH_TOKEN='...'
```

Then the one command:

```bash
npm run db:migrate -- --require-remote
```

It applies every migration the database does not have yet, in one go, and checks it. Migrations **0007 to 0010** are:

| # | Name | What it adds |
| --- | --- | --- |
| 0007 | `pilot_consent` | the consent fields on accounts, and "audio deleted on" on recordings |
| 0008 | `full_mock` | the full-mock session status |
| 0009 | `teacher_v1` | teacher ratings for every part and mock, the class sharing fields |
| 0010 | `exam_laptop` | class mocks, exam passes, the class PIN |

If the database does not have `0005_exam_date` and `0006_teachers` yet either, the same command applies those first. That
is expected. You should see `db:migrate: OK. N migrations applied, foreign key check clean`. Running it again changes
nothing. To only look (nothing is written): `npm run db:migrate -- --check --require-remote`. Expected at the end:
**11 migrations** in total (0000 to 0010).

Alternative without Terminal: GitHub → **Actions** → **Deploy production** → **Run workflow** on `main`, stage `migrate`
(then `check`). It uses the stored secrets.

Close the Terminal window afterwards (that forgets the two values).

---

## 3. Make Azamat a teacher

Nobody can become a teacher from the app; only you can, by hand.

1. **Azamat signs up** as an ordinary student in the app (his own email and password). Only an account that exists can be
   made a teacher.
2. In the same Terminal setup as section 2 (the two `TURSO_` values exported), run, with his real email:

```bash
node scripts/set-role.mjs azamat@example.com teacher
```

   Expected: `set-role: azamat@example.com is now a teacher.` If it says "no registered account", he has not signed up with
   that exact email yet.
3. Azamat signs out and in again. His **Home** now shows **Your classes** and a **Create class** button.

To undo: the same command with `student` instead of `teacher`.

---

## 4. Record each student's consent

Do this **for every student, before they join the class**. Without it they cannot record at all (that is the lock).

1. Each student **signs up** in the app first (their own email and password). Under 18: a parent may help, and the
   name they later give the teacher is a first name only.
2. You hold the parent's written "yes" (a message or a signed note), or the adult student's own "yes".
3. In Terminal (the two `TURSO_` values exported), one student at a time, with their real email:

```bash
node scripts/set-consent.mjs student@example.com granted --teacher-sharing
```

   `--teacher-sharing` is what lets Azamat see their results and listen to recordings. Leave it out and the student can
   practise but **cannot** join a class. Expected: a line saying consent was recorded. It stores the date and which text
   they agreed to (`pilot-consent-v1`).
4. The student's **Account** page now says "Consent recorded on …".

To lock someone again at once (data is kept): 

```bash
node scripts/set-consent.mjs student@example.com withdrawn
```

To delete a person's account and everything in it (run it once without `--yes` first: it only shows what would go):

```bash
node scripts/delete-account.mjs student@example.com
```

```bash
node scripts/delete-account.mjs student@example.com --yes
```

---

## 5. Create the class and get students in

**Azamat, on his phone or laptop:** **Home** → **Create class** → type a class name → **Create class**. The class page shows
a **6-character join code**. He writes it on the board.

**Each student, on their own phone, at home or in the corridor, before the class day:**

1. Open the app, sign in → **Account** → **Join a class** → type the code.
2. The share screen shows what the teacher will see: their results **and recordings** (deleted after 30 days). They confirm
   **"Name your teacher sees"** (a first name only if under 18).
3. They choose a **class PIN**: 4 digits that only they know. **Azamat cannot see it.** They must remember it.
4. They tap **Share with this teacher**.

Only answers made **after** that tap are shared. So everyone must do this **before** the mock. Check on Azamat's class page
that every student appears. A student with no PIN shows on the exam laptop as "No PIN yet. Set one on your phone."

A student who forgot their PIN, or wants to change it: **Account** → **Your classes** → **Set PIN / Change PIN**.

---

## 6. The classroom day, step by step

**You need:** one laptop per room (two rooms = two laptops), a quiet room each, a microphone that works (a headset is
better), power, and the internet. Use **Chrome**, in **full-screen** (press F11, or on a Mac Cmd+Ctrl+F). **Do not use a
private / incognito window**: the laptop would lose its identity if the window is closed. Allow the microphone when the
browser asks.

**About 15 minutes per student.** Ten students on one laptop is about 2.5 hours; on two laptops about 1¼ hours.

### Start (Azamat)

1. On laptop 1, sign in as Azamat → his class → the black button **Start exam laptop**.
2. Choose the paper: **Same paper for everyone** (the app suggests tasks nobody in the class has done) or **A different
   paper for each student**. Give the laptop a name, for example **Room 1**. Press the black button.
3. The laptop shows the student list ("Tap your name"). **Azamat is now signed out of this browser on purpose**, so a student
   cannot wander into his account. Every other page answers "not found".
4. **Second laptop (optional):** sign in as Azamat on laptop 2 → the same class → **Start exam laptop** now says **Join Mock N**.
   Name it **Room 2** and press it. Both laptops share one list: a student in progress in Room 1 cannot be picked in Room 2.

### Each student

1. Taps their **name** in the list ("Not started").
2. Types their 4-digit **PIN**.
3. Sees **"Hi Aziza, this mock is saved to your account"** and the "Before you start" card. They press **Check microphone**,
   then the black **Start mock**.
4. The mock runs by itself, about 15 minutes: Part 1.1, 1.2, 2, 3, with spoken introductions, beeps and timers. Each part
   is sent while the next introduction plays. Nobody touches the laptop.
5. At the end: **"Done. Your results will be on your phone."** The laptop returns to the list by itself after 20 seconds.
   **No level, band or result is ever shown on this screen**, so the next student does not see it.

Azamat should stay near but out of the room, and not look at the screen.

### End (Azamat)

1. On the list screen, tap **Teacher options** (small text under the list).
2. Enter **his email and password**. Choose one:
   - **End exam laptop**: this laptop stops; he is signed in as a teacher again and goes to the class page. Use this at the
     end of each laptop's session.
   - **End and close the class mock**: also stops the other laptop starting new mocks (a student already under way
     finishes). Use this once everybody is done.
3. Do this on **each** laptop. Then close the browser.

---

## 7. What Azamat does after class

Everything is on his own phone or laptop, signed in normally.

1. Class page → **Class mocks** card → open the mock. This is the results page: one row per student with their level, the
   four part bands, and **Listen**. Students sit in level order; the grey control flips the order.
2. Press the black **Open first unrated** (the first student with something he has not marked).
3. For each part: play the recording (speed 1×, 1.25× or 1.5×; there is no download), read the transcript beside it, then
   either **Agree** with the app's band or **Choose level**. If the AI side says **"AI score not ready yet"**, there is
   nothing to agree with: he just **Choose level**. At the bottom he can give **"Your level for this mock"** (optional).
4. Next student (the list stays in order). Aim: about 3 minutes per student.
5. **Recordings are deleted 30 days after scoring.** Mark them within that time. The transcript and feedback stay.

What students see on their phone: their transcript, mistakes with better versions of their own sentences, the AI's
feedback when ready, and **"Your teacher: B2"** next to the app's level, never instead of it.

---

## 8. If something breaks

| What happened | What it means | What to do |
| --- | --- | --- |
| **A student loses the connection in the middle of a mock** (laptop) | Parts already finished are saved. The part that was being sent says **"Send again"**. | Wait for the connection and press **Send again**; it also resends by itself when the laptop is back online. |
| **The page was reloaded, closed, or the browser crashed** | The mock is not lost. The student is "In progress (Room 1)" on that laptop. | If Azamat is signed out (the browser was closed): sign in, open the class, **Start exam laptop** → **Join Mock N** (same room name). Then the student taps their name, types their PIN, and gets **"Continue your mock"** with the finished parts kept. |
| **The whole laptop died** | The student shows "In progress (Room 1)" and cannot be picked on the other laptop. | Wait until about 30 minutes after they started (their pass runs out), then they show "Not started" and can use the other laptop with their PIN and continue the same mock. |
| **A mock is left open** | After 24 hours it becomes **"Not finished"**; the finished parts keep their results. | Nothing to do. |
| **Wrong PIN** | "That PIN isn't right. N tries left." | Let them try again carefully. |
| **PIN locked** | After **5** wrong PINs on one laptop (or 10 across all laptops): "Too many wrong PINs. Ask your teacher to unlock you." | Azamat: **Teacher options** → **Unlock** next to the name → his email and password. If they forgot the PIN: on their own phone **Account** → **Your classes** → **Change PIN** (a new PIN also clears the lock). |
| **"No PIN yet"** beside a name | The student has not set a class PIN. | They do it on their phone (section 5, step 3). |
| **"Locked"** because the student is not consented | Recording is locked. | You run `set-consent.mjs … granted --teacher-sharing` (section 4). |
| **A recording is missing for Azamat** | See the next table. | |
| **Start mock shows "not found"** | The full mock is not switched on. | Set `FULL_MOCK_LIVE=true` and Redeploy (section 1). The exam laptop's start page now says so before the class begins. |
| **"CEFRO can't check answers right now"** | Speech-to-text is not configured or not paid. | Check `TRANSCRIPTION_PROVIDER=openai` and `OPENAI_API_KEY`, and that OpenAI has credit. The recording stays on the laptop; send it again later. |
| **Everything must stop now** | | Azamat: **End and close the class mock**. For a full stop: set `TEACHER_LIVE=false` and Redeploy. Students' own data is kept. |
| **"AI score not ready yet"** | Expected while there is no scoring key or no credit. The transcript and recording are saved. | Nothing. Azamat's level carries the pilot. The student's **Check again** retries it; it fills in properly when credit is added (build step 9, not done yet). |

### A recording is missing for Azamat

| Reason | How to tell | What to do |
| --- | --- | --- |
| It is older than 30 days | The page says **"Recording deleted on …, 30 days after scoring. The transcript and feedback are kept."** | Nothing; this is by design. Use the transcript. |
| The student has no teacher-sharing consent | The student does not appear, or no player | Run `set-consent.mjs … granted --teacher-sharing` for them. |
| The student joined the class after making the answer | Their earlier answers never appear | Only answers made after the **Share** tap are shared. Ask them to redo it. |
| The student left the class, or was removed | They are gone from the class page | They must join again (new Share tap); old answers are not re-shared. |
| The part never uploaded | The student's mock shows **"Not finished"** with that part missing | Nothing can recover a part that never reached the server. Let them redo the mock. |
| Consent was withdrawn | Recording locks; Azamat loses access at once | By design. |

---

## 9. After the pilot

- Switch the pilot off: `TEACHER_LIVE=false` (and `FULL_MOCK_LIVE=false`) in Vercel, then Redeploy. Data stays.
- Delete anyone who asks (parent withdraws): section 4, `delete-account.mjs`.
- Recordings delete themselves 30 days after scoring (needs `CRON_SECRET`; check the Cron Jobs page now and then).
- When Gemini credit arrives: add `GEMINI_API_KEY`, then the live checks in `docs/launch-checklist.md`, section 6. Answers
  already recorded can be re-scored later (step 9 of `docs/v1-plan.md`, not built yet).
