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
  kind: "speech" | "silence" | "near_silence";
  seconds?: number;
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
  { id: "T06-silence", description: "Eight seconds of digital silence.", kind: "silence", seconds: 8 },
  { id: "T07-near-silence", description: "Eight seconds of very quiet noise (open microphone, no speech).", kind: "near_silence", seconds: 8 },
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
}

export const PIPELINE_SAMPLES: PipelineSample[] = [
  { id: "P1-normal-b2", description: "Normal B2 answer", source: "S01" },
  { id: "P2-weaker", description: "Weaker B1 answer (also the first attempt of the retry pair)", source: "S03" },
  { id: "P3-grammar-mistakes", description: "Obvious grammar mistakes", source: "S04" },
  { id: "P4-repetition", description: "Repeated words and phrases", source: "S07" },
  { id: "P4b-fillers", description: "Many hesitations and false starts", source: "S09" },
  { id: "P5-off-task", description: "Does not address the task", source: "S10" },
  { id: "P6-retry-stronger", description: "Stronger retry of P2 (weak-to-strong pair)", source: "S01", retryOf: "P2-weaker" },
  { id: "P7-guided-retry", description: "Synthetic guided retry of P2: P2's transcript rewritten applying only P2's retry focus", source: "S03", retryOf: "P2-weaker", guided: true },
];

export const pipelineText = (sample: PipelineSample) => B2_PART2_SAMPLES.find((x) => x.id.startsWith(sample.source))!.transcript;
