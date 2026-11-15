import "server-only";
import type { TranscriptionInput, TranscriptionOutput, TranscriptionProvider } from "./types";

/**
 * Development-only provider: returns a canned learner transcript so the
 * full flow can be exercised without API keys. It does NOT listen to the
 * audio. Never enable in production (see provider factory).
 */
const SAMPLES = [
  "Um, I want to talk about advice from my father. I think when I was sixteen, I want to stop school and work. " +
    "My father say no, you must study. I think he was right, so I listen him. Now I am study in university. " +
    "I think young people should, um, listen older people because they know many thing. So I think advice is good.",
  "I'd like to talk about some advice my aunt gave me when I was choosing a university. I was, uh, really confused, because my friends were all applying to economics. " +
    "She told me to visit a few universities and talk to students before deciding, and although it took a lot of time, I followed her advice. " +
    "As a result, I chose a programme I really enjoy. On the other hand, I don't think young people should always follow advice from older people, " +
    "because the world is changing quickly and some advice may be out of date. However, they should listen carefully before making their own decision.",
];

export class MockTranscriptionProvider implements TranscriptionProvider {
  readonly name = "mock";
  readonly model = "mock-transcript-v1";

  async transcribe(input: TranscriptionInput): Promise<TranscriptionOutput> {
    await new Promise((resolve) => setTimeout(resolve, 800));
    // Larger recordings get the longer sample, so retries can be compared in development.
    const sample = input.audio.byteLength > 150_000 ? SAMPLES[1] : SAMPLES[0];
    return { text: sample, language: "en" };
  }
}
