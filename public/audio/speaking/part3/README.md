# Part 2 and Part 3 introduction audio

The spoken introduction of Part 2 (`../part2/intro/v1/intro.wav`) and Part 3 (`intro/v1/intro.wav`): what happens in
the part, the timings and "Start speaking when you hear this sound" (the chime follows, made in code). Our own wording;
the official introductions are a reference for the format only. One file per part, the same for every task. Nothing
calls a speech service while a student practises.

Made with **the same voice and settings as the Part 1 questions** (see `../part1/README.md` for the full credit):

| Item | Value |
|---|---|
| Engine | Piper text-to-speech, https://github.com/rhasspy/piper (MIT licence) |
| Voice | `en-us-libritts-high`, speaker 6426 (Piper voice release v0.0.2) |
| Voice training data | LibriTTS (Zen et al., 2019), http://www.openslr.org/60/, **CC BY 4.0** |
| Texts | `src/content/speaking/part-intro-audio.json` |
| Made by | `scripts/make-part1-question-audio.mjs` (`ONLY=/intro/v1/` remakes only these two files) |

Attribution (CC BY 4.0): voice model trained by the Piper project on the LibriTTS corpus by Heiga Zen, Viet Dang, Rob
Clark, Yu Zhang, Ron J. Weiss, Ye Jia, Zhifeng Chen and Yonghui Wu, licensed under CC BY 4.0
(https://creativecommons.org/licenses/by/4.0/). The audio files here were generated from that model and slowed down.
