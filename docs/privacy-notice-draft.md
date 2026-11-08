# CEFRO privacy notice: DRAFT for legal review

**Draft, 2026-11-08. Not published. Not legal advice.** Written in plain English for students and parents. Every
statement marked **[CHECK]** needs a lawyer's confirmation before use. Text in `[square brackets]` is to be filled in.
It describes the app as designed in `docs/consent-design.md` (parent code, recording only after consent); where the
app differs today, that is noted. Translations into Uzbek and Russian are expected [CHECK].

---

## 1. Who we are

CEFRO is an app for practising the speaking part of the UZBMB multilevel exam. It is run by **[controller: name,
legal form, address, registration number]** ("we"). Contact: **[contact address]** [CHECK: whether a named person
responsible for personal data must be appointed and named here].

## 2. What we collect

| What | When | Why |
| --- | --- | --- |
| Email address and password (stored only as a scrambled hash) | You create an account | To let you sign in |
| Name (optional), exam date (optional) | You add them on the Account page | To personalise the app and count down to your exam |
| Month and year of birth | Before your first recording | To know if a parent must agree first |
| **Your voice recordings** | Each time you answer a practice task | To transcribe and score your answer, and so you can listen again |
| Transcripts, scores, feedback | After each answer | To show your results and progress |
| Practice activity (which tasks, when, attempt numbers) | While you use the app | To show your history and improve the app |
| Sign-in data (session, IP address, browser type) | Each sign-in | Security, limiting abuse |
| A browser cookie | First visit | To keep your practice together before you have an account, and to keep you signed in |
| **For students under 18:** your parent's name and relationship, the date and version of their agreement, and what they agreed to | When your parent agrees | To record their consent |
| **If you join a class:** the name you choose to show your teacher, and your teacher's ratings of your answers | When you tap "Share with this teacher" | So your teacher can help you |

We do **not** ask for your phone number, address, passport details or photos. The microphone check before practice is
never saved or sent anywhere.

Recordings may contain anything you say, including things about your family, health or school. Please avoid personal
details in your answers.

## 3. Why we are allowed to use it

We use your data because you (or, if you are under 18, your parent) agreed to it, and to provide the service you
asked for [CHECK: the legal basis or bases available, and whether consent must be in a separate document or in
writing]. You can withdraw your agreement at any time (section 8).

## 4. Students under 18

- A student under 18 can't record answers until a parent or legal guardian agrees [CHECK: that 18 is the right age,
  and whether a younger minimum age applies].
- The parent agrees on the parent page with a code the student gives them, on their own phone. We cannot check who
  the parent is [CHECK: whether this method of consent is sufficient].
- The parent receives a private **parent key**. With it they can see what they agreed to, turn teacher sharing off,
  withdraw consent, and delete the student's account, without the student's password.
- If no parent agrees within **14 days**, we delete the account [CHECK period].
- When the student turns 18, they are asked to agree for themselves, and the parent key stops working.
- Teachers never see a student's age, birth month or parent's details.

## 5. Who else receives your data

- **Scoring providers.** To transcribe and score an answer, we send the recording and its transcript to an AI
  provider: **[Google (Gemini) / OpenAI / Anthropic: list the ones actually used in production]**. Their own rules
  on how long they keep it apply; deleting your CEFRO account does not delete their copies [CHECK: the providers'
  current terms on retention and on using the data for training; whether a data processing agreement is needed].
- **Hosting.** The app runs on **Vercel** and the database (including recordings) on **Turso**, outside
  Uzbekistan [CHECK: servers' countries; whether data of citizens of Uzbekistan must be stored in Uzbekistan; whether
  cross-border transfer needs extra consent or notice].
- **Your teacher**, only if you choose to share with a class: the name you chose, your level, and the answers you make
  after sharing (transcripts, scores, feedback). Never your email, recordings, exam date or earlier answers.
- **Anonymous scoring pairs.** When you leave a class, we keep your teacher's level and ours for an answer as a pair
  of numbers, with no name, date or id, to improve scoring. It can't be linked to you and so can't be deleted
  [CHECK: that this is anonymous data outside the scope of personal-data rules].
- **Authorities**, if the law requires it [CHECK].

We do not sell your data and do not show ads.

## 6. How long we keep it

- Account, recordings, results: until you delete your account [CHECK: whether a maximum period must be set].
- Under-18 accounts waiting for a parent: 14 days.
- Consent records: as long as the account exists [CHECK: whether proof must be kept after deletion, and for how long].
- Server logs: [period set by the hosting provider] [CHECK].

## 7. Security

Passwords are stored only as a hash. Parent codes and keys are stored only as hashes. Recordings can only be opened by
their owner. Access to the database is limited to [who]. [CHECK: required security measures and breach notification
duties.]

## 8. Your rights

You can:
- **see and correct** your name and exam date on the Account page;
- **delete your account** on the Account page (this deletes your recordings, attempts, results, classes and consent
  records at once);
- **withdraw consent** (student or parent): this deletes the account in the same way;
- **leave a class** at any time: your teacher loses access at once;
- **ask us** for a copy of your data or about anything in this notice at **[contact]**. (A download button does not
  exist yet.) [CHECK: the full list of rights, the deadline to answer requests, and the authority to complain to.]

## 9. Changes

If we change this notice in a way that affects what we do with your data, we will ask again before using it in the
new way. Version: **[number], [date]**.

---

### Notes for the reviewer (not part of the notice)

1. Today the app lets anyone record without an account and without an age question; the age step is not built.
2. Today the app sends no email, so "contact us" must be a channel we can actually answer.
3. Please also check: registration of the personal-data database with any state register [CHECK]; whether the
   notice must be in the state language [CHECK]; rules for processing voice recordings as biometric data, if any
   [CHECK].
