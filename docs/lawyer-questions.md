# Questions for a lawyer (30 minutes)

CEFRO: an app for practising the speaking part of the UZBMB multilevel exam. It records a student's spoken
answer, sends the audio and transcript to an AI provider (abroad) for scoring, and stores the recording, transcript and
feedback. Many students are under 18. Pilot: about 10 testers known personally, nobody under 14, run by Asadbek as a
private person. Bring: `docs/consent-design.md`, `docs/privacy-notice-draft.md`, `docs/terms-draft.md`,
`docs/pilot-parent-message.md`. In priority order:

1. **Data location (first).** Must personal data of citizens of Uzbekistan (recordings, transcripts, emails) be
   stored on servers in Uzbekistan? Today the database (Turso), hosting (Vercel) and AI providers (Google, OpenAI or
   Anthropic) are abroad. Is sending audio abroad for scoring a cross-border transfer, and what does it need
   (consent wording, a notice, an agreement with the provider)? Does this apply already in the pilot?
2. **Parent code.** Is a parent's confirmation on our parent page with a one-time code (we can't verify who the
   parent is) enough consent for a minor? If not, what is: a signed paper note, SMS, an ID service? For the pilot, is a
   written "yes" by message or paper, kept by the owner, enough?
3. **Age.** Is 18 the age from which a person consents alone? Is there a minimum age below which a child may not use
   the app even with a parent's consent? (We invite nobody under 14 meanwhile.)
4. **A student consenting alone.** From some age (e.g. 14 or 16), can a student consent alone to an educational
   app, or to part of it (practice without teacher sharing)?
5. **Controller.** Can Asadbek, a private person, be the data controller for the pilot? What registration,
   notification to a state register, or named responsible person is needed? When must it become a company?
6. **Consent record after deletion.** When an account is deleted, may (or must) we keep a minimal proof of consent,
   e.g. only the date and the notice version, with nothing about the person? How long? Where may the pilot's
   parent replies be kept, and for how long?
7. **Audio retention.** We plan to delete audio 30 days after scoring and keep transcripts and feedback until the
   account is deleted. Is 30 days acceptable, or must it be shorter? Is a voice recording treated as biometric or
   special-category data?
8. **Teachers.** When a student shares answers with a teacher, does the teacher (or their school) need a written
   agreement with us? Are they responsible for what they see?
9. **Anonymous pairs.** Is "teacher level + our level + month", with no ids, anonymous data we may keep forever?
10. **Language and form.** Must the notice and terms be in Uzbek (the state language)? Which version binds? Is a
    tick box enough to accept the terms, and can a minor accept them?
11. **Anything else** in the drafts marked [CHECK] that is wrong or missing.
12. **Provider retention.** The scoring providers receive the audio and transcript inside each request; we store no
    file with them, but they may keep request data for a limited time under their own terms (Gemini's
    abuse-monitoring page says 55 days, also on paid plans; OpenAI has its own terms). We can't delete that copy. Is
    this acceptable for minors' voices? Must the notice name the provider and its retention period, and is our wording
    ("we delete our copy after 30 days; the AI service may keep request data for a limited time") enough? Do we need a
    data processing agreement with the provider?
13. **Teacher listening to a minor's recording.** In the pilot a teacher (Azamat, at our language centre) can listen to a
    student's recording, for as long as it exists (30 days after scoring), when the student has shared it with that
    teacher and, for an under-18, a parent agreed to teacher sharing (`docs/v1-plan.md`, section 7). Can a teacher (not the
    parent) listen to a minor's recording on the parent's consent? Does the parent's message have to say so? (The current
    message says "Teachers see nothing": it has to change or this has to be answered first.) Added 2026-11-12 on
    `claude/pilot-ready`.
