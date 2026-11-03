import { B2_PART2_SAMPLES } from "../evaluation-samples/b2-part2-samples";

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
  /** Regression sample: losing any `keep` phrase FAILS the run (otherwise losses are only reported). */
  mustKeep?: boolean;
  kind: "speech" | "silence" | "near_silence" | "noise";
  seconds?: number;
  /** Speech split into parts with silence before, between and after (pauses must not stop transcription). */
  pauses?: { chunks: string[]; lead: number; gap: number; trail: number };
  /** Speech made this many dB quieter (negative). */
  quietDb?: number;
  /** Steady noise only. */
  noise?: { color: "white" | "pink"; amplitude: number };
}

const s = (id: string) => B2_PART2_SAMPLES.find((x) => x.id.startsWith(id))!;

export const TRANSCRIPTION_SAMPLES: AudioSample[] = [
  {
    id: "T01-normal-b2",
    description: "Normal B2 Part 2 answer (the strong sample from the evaluation set).",
    kind: "speech",
    ref: s("S01").transcript,
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
  {
    id: "T12-verbatim-regression",
    description:
      "Regression: speech-to-text once 'corrected' a learner's 'nobody will helps' to 'nobody helps'. These phrases must come back word for word, or the run fails.",
    kind: "speech",
    ref:
      "In my opinion, social media is making young people less sociable. They sit together but they don't talking to each other, " +
      "they only look at their phones. And when you have a real problem, nobody will helps you, because everybody is busy with the screen.",
    keep: ["nobody will helps", "they don't talking", "less sociable"],
    mustKeep: true,
  },
  { id: "T06-silence", description: "Eight seconds of digital silence.", kind: "silence", seconds: 8 },
  { id: "T07-near-silence", description: "Eight seconds of very quiet noise (open microphone, no speech).", kind: "near_silence", seconds: 8 },
  { id: "T10-room-noise", description: "Eight seconds of steady room noise at a moderate level, no speech.", kind: "noise", seconds: 8, noise: { color: "pink", amplitude: 0.01 } },
  { id: "T11-loud-steady-noise", description: "Eight seconds of loud steady noise (fan), no speech.", kind: "noise", seconds: 8, noise: { color: "white", amplitude: 0.05 } },
];

/** The strong answer re-encoded, to check the other containers the app accepts. */
export const FORMAT_SAMPLE_REF = s("S01").transcript;

/** Samples for the full pipeline: the audio is the text-to-speech rendering of an evaluation-set transcript. */
export interface PipelineSample {
  id: string;
  description: string;
  source: string; // evaluation sample id the spoken text comes from
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

export const PIPELINE_SAMPLES: PipelineSample[] = [
  { id: "P1-normal-b2", description: "Normal B2 answer", source: "S01" },
  { id: "P2-weaker", description: "Weaker B1 answer (also the first attempt of the retry pair)", source: "S03" },
  { id: "P3-grammar-mistakes", description: "Obvious grammar mistakes", source: "S04" },
  { id: "P4-repetition", description: "Repeated words and phrases", source: "S07" },
  { id: "P4b-fillers", description: "Many hesitations and false starts", source: "S09" },
  { id: "P5-off-task", description: "Does not address the task", source: "S10" },
  { id: "P6-retry-stronger", description: "Stronger retry of P2 (weak-to-strong pair)", source: "S01", retryOf: "P2-weaker" },
  { id: "P8-pauses", description: "Grammar-mistakes answer spoken in three parts with 3 s pauses and 4 s of silence before and after", source: "S04", pauses: true },
  { id: "P7-guided-retry", description: "Synthetic guided retry of P2: P2's transcript rewritten applying only P2's retry focus", source: "S03", retryOf: "P2-weaker", guided: true },
];

/** Splits an answer into three consecutive parts at sentence boundaries (for the paused-speech sample). */
export function threeParts(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)/g)?.map((x) => x.trim()) ?? [text];
  const size = Math.ceil(sentences.length / 3);
  return [0, 1, 2].map((i) => sentences.slice(i * size, (i + 1) * size).join(" ")).filter(Boolean);
}

export const pipelineText = (sample: PipelineSample) => B2_PART2_SAMPLES.find((x) => x.id.startsWith(sample.source))!.transcript;
