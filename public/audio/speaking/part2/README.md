# Part 2 audio

- `intro/v1/intro.wav`: the spoken introduction of Part 2. See `../part3/README.md` (one README for the Part 2 and
  Part 3 introductions, with the voice credit).
- `<task id>/v<task version>/questions.wav`: the examiner reading each task aloud after the introduction's chime (the
  task line and its three questions, as on screen), before the minute of preparation. Texts:
  `src/content/speaking/part2-question-audio.json`; made by `scripts/make-part1-question-audio.mjs`
  (`ONLY=questions.wav` remakes only these) with the same voice and settings as Part 1 (credit: `../part1/README.md`,
  LibriTTS CC BY 4.0). Our own wording; nothing calls a speech service while a student practises.
