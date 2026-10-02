import "server-only";
import type { TranscriptionInput, TranscriptionOutput, TranscriptionProvider } from "./types";

/**
 * Development-only provider: returns a canned learner transcript so the
 * full flow can be exercised without API keys. It does NOT listen to the
 * audio. Never enable in production (see provider factory).
 */
const SAMPLES = [
  "Um, I think technology is very important for young people. I think we use phones every day for, uh, talking with friends. " +
    "For example I use Telegram and Instagram. I think social media is good because we can talk with friends. " +
    "But also it is bad because people spend too much time. I think schools should, um, limit phones because students are not concentrate in lessons. " +
    "So I think technology is good and bad.",
  "In my opinion, technology helps young people stay in touch, although it can also reduce face-to-face interaction. " +
    "Personally, I message my classmates every day, and when my best friend moved to another city, video calls helped us keep our friendship. " +
    "On the other hand, social media can be a distraction, and some of my friends compare themselves with others, which makes them, uh, less confident. " +
    "As for schools, I believe they should limit phones during lessons, because students who check notifications cannot focus. " +
    "However, banning phones completely would be unfair, since we use them for research. So overall, technology makes us more connected if we use it wisely.",
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
