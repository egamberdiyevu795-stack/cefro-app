import { PART2_BAND_ANCHORS } from "../evaluation-samples/part2-band-anchors";

/**
 * Controlled audio samples for the real-transcription validation. Every `ref` is the exact text that is spoken
 * (by text-to-speech, see audio.ts), so what the speech-to-text step heard can be compared with what was said.
 */
export interface AudioSample {
  id: string;
  description: string;
  /** Exact words spoken, including mistakes, fillers and repetitions. */
  ref?: string;
  /** Learner mistakes that must survive transcription (checked with the same normalisation as evidence quotes). */
  keep?: string[];
  kind: "speech" | "silence" | "near_silence" | "noise";
  seconds?: number;
  /** Speech split into parts with silence before, between and after (pauses must not stop transcription). */
  pauses?: { chunks: string[]; lead: number; gap: number; trail: number };
  /** Speech made this many dB quieter (negative). */
  quietDb?: number;
  /** Steady noise only. */
  noise?: { color: "white" | "pink"; amplitude: number };
}

const s = (id: string) => PART2_BAND_ANCHORS.find((x) => x.id.startsWith(id))!;

export const TRANSCRIPTION_SAMPLES: AudioSample[] = [
  {
    id: "T01-normal-b2",
    description: "Normal B2 Part 2 answer (the B2 anchor from the evaluation set).",
    kind: "speech",
    ref: s("A4").transcript,
  },
  {
    id: "T02-learner-errors",
    description: "Realistic grammar and vocabulary mistakes that must not be silently corrected.",
    kind: "speech",
    ref:
      "Yesterday I have went to the market and I buy two bread. My friend he don't like technology because it make people lazy. " +
      "Me and my friend is discussing about this problem many times. In my opinion the phones is very usefull for study, " +
      "but too much of them are dangerous for the eyes.",
    keep: ["I have went", "I buy two bread", "he don't like", "it make people lazy", "Me and my friend is", "discussing about", "the phones is"],
  },
  {
    id: "T03-fillers",
    description: "Natural hesitation: um, uh, er, well, repeated starts.",
    kind: "speech",
    ref:
      "Um, well, I think that, uh, technology is, is very useful for, for young people. Well, um, for example, I I talk with my cousin " +
      "every day, uh, on video call. Er, but sometimes, um, sometimes it is it is difficult to, to concentrate.",
  },
  {
    id: "T04-repetition",
    description: "Repeated words and phrases (checks the repetition metrics).",
    kind: "speech",
    ref:
      "Phones are good. Phones are very good for friends and very good for school and very good for family. " +
      "I think phones are good because phones are good for everything, so phones are good.",
  },
  { id: "T05-short", description: "Too short to assess (3 words).", kind: "speech", ref: "I like phones." },
  {
    id: "T08-pauses",
    description: "Three sentences with 3 s pauses between them, 4 s of silence before and after (pauses and leading/trailing silence).",
    kind: "speech",
    pauses: {
      chunks: [
        "Well, I think technology is useful for young people.",
        "For example, I talk with my cousin every day on video call.",
        "But sometimes it is difficult to concentrate.",
      ],
      lead: 4,
      gap: 3,
      trail: 4,
    },
    ref:
      "Well, I think technology is useful for young people. For example, I talk with my cousin every day on video call. " +
      "But sometimes it is difficult to concentrate.",
  },
  {
    id: "T09-quiet-learner-errors",
    description: "The learner-errors answer spoken 35 dB quieter than normal (quiet speaker or distant microphone).",
    kind: "speech",
    quietDb: -35,
    ref:
      "Yesterday I have went to the market and I buy two bread. My friend he don't like technology because it make people lazy. " +
      "Me and my friend is discussing about this problem many times. In my opinion the phones is very usefull for study, " +
      "but too much of them are dangerous for the eyes.",
    keep: ["I have went", "I buy two bread", "he don't like", "it make people lazy", "Me and my friend is", "discussing about", "the phones is"],
  },
  { id: "T06-silence", description: "Eight seconds of digital silence.", kind: "silence", seconds: 8 },
  { id: "T07-near-silence", description: "Eight seconds of very quiet noise (open microphone, no speech).", kind: "near_silence", seconds: 8 },
  { id: "T10-room-noise", description: "Eight seconds of steady room noise at a moderate level, no speech.", kind: "noise", seconds: 8, noise: { color: "pink", amplitude: 0.01 } },
  { id: "T11-loud-steady-noise", description: "Eight seconds of loud steady noise (fan), no speech.", kind: "noise", seconds: 8, noise: { color: "white", amplitude: 0.05 } },
];

/** The strong answer re-encoded, to check the other containers the app accepts. */
export const FORMAT_SAMPLE_REF = s("A4").transcript;

/** Samples for the full pipeline: the audio is the text-to-speech rendering of an evaluation-set transcript. */
export interface PipelineSample {
  id: string;
  description: string;
  /** Band anchor id (prefix) the spoken text comes from; ignored when `text` is set. */
  source: string;
  /** Spoken text written for this sample (behaviours no anchor shows, e.g. heavy repetition). */
  text?: string;
  /** Retry of the sample with this id, in the same practice session. */
  retryOf?: string;
  /**
   * The spoken text is generated at run time: the model rewrites the first attempt's transcript applying ONLY that
   * attempt's retry focus (synthetic: simulates a learner who followed the feedback; not a real learner).
   */
  guided?: boolean;
  /** Spoken in three parts with 3 s pauses and 4 s of silence before and after (pauses must not stop the pipeline). */
  pauses?: boolean;
}

const REPETITIVE_ANSWER =
  "I think advice is good. My father give me good advice. I think good advice is very good. My father say study is good, " +
  "so I think study is good. I think young people should listen advice because advice is good. I think advice is good for everybody, so advice is good.";

const HESITANT_ANSWER =
  "Um, well, I want to talk about, uh, about advice from my, my uncle. Er, last year I, I was, um, choosing a university and, uh, " +
  "I didn't know, I didn't know what to, to choose. Um, he told me to, uh, to visit the universities first. Well, I, I did it and, um, " +
  "it helped me. Er, about young people, um, I think they should, uh, listen to older people, but, um, not always, because, uh, " +
  "sometimes the advice is, is old.";

export const PIPELINE_SAMPLES: PipelineSample[] = [
  { id: "P1-normal-b2", description: "Normal B2 answer", source: "A4" },
  { id: "P2-weaker", description: "Weaker B1 answer (also the first attempt of the retry pair)", source: "A2" },
  { id: "P3-grammar-mistakes", description: "Obvious grammar mistakes", source: "A0-below-b1" },
  { id: "P4-repetition", description: "Repeated words and phrases", source: "", text: REPETITIVE_ANSWER },
  { id: "P4b-fillers", description: "Many hesitations and false starts", source: "", text: HESITANT_ANSWER },
  { id: "P5-off-task", description: "Does not address the task", source: "A0-memorized" },
  { id: "P6-retry-stronger", description: "Stronger retry of P2 (weak-to-strong pair)", source: "A4", retryOf: "P2-weaker" },
  { id: "P8-pauses", description: "Grammar-mistakes answer spoken in three parts with 3 s pauses and 4 s of silence before and after", source: "A0-below-b1", pauses: true },
  { id: "P7-guided-retry", description: "Synthetic guided retry of P2: P2's transcript rewritten applying only P2's retry focus", source: "A2", retryOf: "P2-weaker", guided: true },
];

/** Splits an answer into three consecutive parts at sentence boundaries (for the paused-speech sample). */
export function threeParts(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)/g)?.map((x) => x.trim()) ?? [text];
  const size = Math.ceil(sentences.length / 3);
  return [0, 1, 2].map((i) => sentences.slice(i * size, (i + 1) * size).join(" ")).filter(Boolean);
}

export const pipelineText = (sample: PipelineSample) => sample.text ?? s(sample.source).transcript;
