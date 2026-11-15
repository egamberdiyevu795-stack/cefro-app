"use client";

import { useRef, useState, type SyntheticEvent } from "react";
import { cx } from "@/components/ds/cx";
import { FOCUS_RING } from "@/components/ds/styles";
import { useHydrated } from "@/components/ds/useHydrated";
import { AUDIO_RETENTION_DAYS, shortDate } from "@/domain/audio-retention";
import { PLAYBACK_SPEEDS, speedLabel, type PlaybackSpeed } from "@/domain/teacher/rules";
import type { TeacherListen } from "@/features/teacher/mock-view";

/**
 * The teacher's player (docs/v1-plan.md sections 4.3 and 5): a student's recording, play only. Speed 1x / 1.25x / 1.5x
 * (grey chips, never a black button), no download button anywhere: the native menu's download is switched off, the
 * speed menu is replaced by our own chips, and when the browser cannot play it there is no download link either, only
 * a sentence. After the 30 days there is no player, only the note. Nothing here is logged (owner decision).
 */
export function TeacherPlayer({ listen, who, className }: { listen: TeacherListen; who: string; className?: string }) {
  if (listen.state === "deleted") {
    return (
      <p data-testid="teacher-audio-deleted" className={cx("text-label text-fg-muted", className)}>
        Recording deleted on {shortDate(listen.deletedAt)}, {AUDIO_RETENTION_DAYS} days after scoring. The transcript and feedback are kept.
      </p>
    );
  }
  return <Player src={listen.src} durationMs={listen.durationMs} who={who} className={className} />;
}

function Player({ src, durationMs, who, className }: { src: string; durationMs: number; who: string; className?: string }) {
  const ready = useHydrated();
  const audio = useRef<HTMLAudioElement>(null);
  const fixing = useRef(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>(1);
  const [failed, setFailed] = useState(false);

  // Chrome writes WebM without a duration: seek far past the end once so the browser learns it (as the student's player does).
  const onLoadedMetadata = (event: SyntheticEvent<HTMLAudioElement>) => {
    const el = event.currentTarget;
    if (Number.isFinite(el.duration) || fixing.current) return;
    fixing.current = true;
    const restore = () => {
      el.removeEventListener("timeupdate", restore);
      el.currentTime = 0;
      fixing.current = false;
    };
    el.addEventListener("timeupdate", restore);
    el.currentTime = Number.MAX_SAFE_INTEGER;
  };

  const choose = (next: PlaybackSpeed) => {
    setSpeed(next);
    if (audio.current) audio.current.playbackRate = next;
  };

  if (failed) {
    return (
      <p className={cx("rounded-tile bg-well p-3 text-body text-fg", className)} data-testid="teacher-audio-failed">
        This browser can&apos;t play the recording here. Try another browser.
      </p>
    );
  }
  return (
    <div className={cx("space-y-2", className)} data-testid="teacher-player">
      <audio
        ref={audio}
        controls
        controlsList="nodownload noplaybackrate"
        preload="metadata"
        src={src}
        aria-label={`Recording: ${who}`}
        className="h-10 w-full"
        onLoadedMetadata={(e) => {
          e.currentTarget.playbackRate = speed;
          onLoadedMetadata(e);
        }}
        onContextMenu={(e) => e.preventDefault()}
        onError={() => setFailed(true)}
      />
      <div role="group" aria-label="Playback speed" className="flex flex-wrap items-center gap-2">
        {PLAYBACK_SPEEDS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={speed === value}
            disabled={!ready}
            onClick={() => choose(value)}
            className={cx(
              "inline-flex h-9 min-w-14 items-center justify-center rounded-full border-2 px-3 text-label font-medium text-fg transition-colors disabled:opacity-60",
              speed === value ? "border-fg bg-well" : "border-transparent bg-well hover:bg-line",
              FOCUS_RING,
            )}
          >
            {speedLabel(value)}
          </button>
        ))}
        {durationMs > 0 && <span className="text-caption text-fg-muted">Length {lengthText(durationMs)}</span>}
      </div>
    </div>
  );
}

function lengthText(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
