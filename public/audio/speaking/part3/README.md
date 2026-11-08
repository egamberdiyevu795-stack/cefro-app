# Part 3 introduction audio

The spoken introduction of each Part 3 topic: what the part is, the statement, the timings and "Start speaking when you
hear this sound" (the chime sample follows, made in code). Our own wording. One file per topic version:
`<task id>/v<task version>/intro.wav`. Nothing calls a speech service while a student practises.

Made with **the same voice and settings as the Part 1 questions** (see `../part1/README.md` for the full credit):

| Item | Value |
|---|---|
| Engine | Piper text-to-speech, https://github.com/rhasspy/piper (MIT licence) |
| Voice | `en-us-libritts-high`, speaker 6426 (Piper voice release v0.0.2) |
| Voice training data | LibriTTS (Zen et al., 2019), http://www.openslr.org/60/, **CC BY 4.0** |
| Texts | `src/content/speaking/c1/part3-intro-audio.json` (built from `part3IntroText` in `part3-intro-audio.ts`) |
| Made by | `scripts/make-part1-question-audio.mjs` (`ONLY=/part3/` remakes only these files) |

Attribution (CC BY 4.0): voice model trained by the Piper project on the LibriTTS corpus by Heiga Zen, Viet Dang, Rob
Clark, Yu Zhang, Ron J. Weiss, Ye Jia, Zhifeng Chen and Yonghui Wu, licensed under CC BY 4.0
(https://creativecommons.org/licenses/by/4.0/). The audio files here were generated from that model and slowed down.
