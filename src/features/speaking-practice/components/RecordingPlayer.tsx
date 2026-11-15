"use client";

import { useRef, useState, type SyntheticEvent } from "react";


/**
 * Audio player for a recorded answer.
 *
 * Chrome's MediaRecorder writes WebM without a duration in the header, so the browser reports `duration = Infinity`
 * and the native player shows 0:00 and cannot seek. Seeking far past the end makes the browser scan the file and learn
 * the real duration; the player is then put back at the start. `preload="metadata"` (not "none") makes the browser
 * read enough of the file to show a length before the student presses play. The known length from the recorder is
 * shown next to the player as a fallback.
 */
export function RecordingPlayer({ src, durationMs, label }: { src: string; durationMs: number | null; label: string }) {
  const fixing = useRef(false);
  const [failed, setFailed] = useState(false);

  const onLoadedMetadata = (event: SyntheticEvent<HTMLAudioElement>) => {
    const audio = event.currentTarget;
    if (Number.isFinite(audio.duration) || fixing.current) return;
    fixing.current = true;
    const restore = () => {
      audio.removeEventListener("timeupdate", restore);
      audio.currentTime = 0;
      fixing.current = false;
    };
    audio.addEventListener("timeupdate", restore);
    audio.currentTime = Number.MAX_SAFE_INTEGER;
  };

  if (failed) {
    return (
      <p className="rounded-tile bg-well p-3 text-body text-fg">
        This browser can&apos;t play the recording here.{" "}
        <a className="font-medium underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent" href={src} download>
          Download it
        </a>{" "}
        to listen.
      </p>
    );
  }
  return (
    <div className="space-y-1">
      <audio
        controls
        preload="metadata"
        src={src}
        aria-label={label}
        className="h-10 w-full"
        onLoadedMetadata={onLoadedMetadata}
        onError={() => setFailed(true)}
      />
      {durationMs !== null && durationMs > 0 && <p className="text-caption text-fg-muted">Length {lengthText(durationMs)}</p>}
    </div>
  );
}

/** m:ss, rounded to the nearest second (the native player rounds the same way). */
function lengthText(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
