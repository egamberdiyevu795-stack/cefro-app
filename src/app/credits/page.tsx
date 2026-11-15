import type { Metadata } from "next";
import { Card } from "@/components/ds";

export const metadata: Metadata = { title: "Credits" };

/**
 * Credits: the attribution CC BY 4.0 asks for the spoken questions and introductions (docs/launch-checklist.md, section 12).
 * The wording is the one recorded next to the audio files (public/audio/speaking/part1/README.md). A plain design-system
 * page: static, no sign-in, no database, no button. Linked quietly from the footer (src/components/SiteFooter.tsx).
 */
export default function CreditsPage() {
  return (
    <div className="min-h-dvh bg-page px-4 pb-8 pt-8 font-ui text-fg sm:pt-16">
      <main id="main" className="mx-auto w-full max-w-2xl">
        <p className="mb-4 text-body font-semibold tracking-[0.08em] text-fg">CEFRO</p>
        <Card aria-labelledby="credits-title">
          <h1 id="credits-title" className="text-title font-medium tracking-[-0.01em] text-fg">
            Credits
          </h1>

          <h2 className="mt-6 text-body font-medium text-fg">The voice that reads the questions</h2>
          <p className="mt-2 text-body text-fg">
            The spoken questions and introductions in CEFRO were made with{" "}
            <a className="underline underline-offset-2" href="https://github.com/rhasspy/piper" rel="noopener noreferrer">
              Piper
            </a>{" "}
            text-to-speech (MIT licence), using the voice model <span className="whitespace-nowrap">en-us-libritts-high</span>, speaker
            6426. They were generated once, ahead of time, from our own question texts.
          </p>

          <h2 className="mt-6 text-body font-medium text-fg">Attribution (CC BY 4.0)</h2>
          <p className="mt-2 text-body text-fg">
            The voice model was trained by the Piper project on the{" "}
            <a className="underline underline-offset-2" href="http://www.openslr.org/60/" rel="noopener noreferrer">
              LibriTTS corpus
            </a>{" "}
            by Heiga Zen, Viet Dang, Rob Clark, Yu Zhang, Ron J. Weiss, Ye Jia, Zhifeng Chen and Yonghui Wu, licensed under{" "}
            <a className="underline underline-offset-2" href="https://creativecommons.org/licenses/by/4.0/" rel="noopener noreferrer">
              CC BY 4.0
            </a>
            .
          </p>
          <p className="mt-2 text-body text-fg">
            Changes: the audio in CEFRO was generated from that model and slowed down (tempo 0.75). It is not the original corpus
            recordings, and the creators of the corpus and of the model do not endorse CEFRO.
          </p>
        </Card>
      </main>
    </div>
  );
}
