# Part 1 question audio

Spoken questions for Part 1.1 and 1.2 (docs/part1-plan.md §1, decision 16). Pre-generated text-to-speech, one voice
for every task, stored with the content and versioned with the task: `<task id>/v<task version>/q<question>.wav`.
Nothing calls a speech service while a student practises.

| Item | Value |
|---|---|
| Engine | Piper text-to-speech, https://github.com/rhasspy/piper (MIT licence) |
| Voice | `en-us-libritts-high`, speaker 6426 (Piper voice release v0.0.2) |
| Voice training data | LibriTTS (Zen et al., 2019), http://www.openslr.org/60/, **CC BY 4.0** |
| Settings | `src/content/speaking/part1/question-audio.json` (texts, paths, speaker, tempo 0.75) |
| Made by | `scripts/make-part1-question-audio.mjs` |

Attribution (CC BY 4.0): voice model trained by the Piper project on the LibriTTS corpus by Heiga Zen, Viet Dang, Rob
Clark, Yu Zhang, Ron J. Weiss, Ye Jia, Zhifeng Chen and Yonghui Wu, licensed under CC BY 4.0
(https://creativecommons.org/licenses/by/4.0/). The audio files here were generated from that model and slowed down.

The start-of-speaking chime is not a file: it is made in code (`src/features/speaking-practice/lib/chime.ts`).
