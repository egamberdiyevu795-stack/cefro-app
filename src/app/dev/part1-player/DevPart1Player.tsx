"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import type { QuestionSequenceTask } from "@/domain/speaking/question-sequence";
import { QuestionSequencePlayer, type QuestionSequenceResult } from "@/features/speaking-practice/components/QuestionSequencePlayer";
import { RecordingPlayer } from "@/features/speaking-practice/components/RecordingPlayer";
import type { AudioFailure } from "@/features/speaking-practice/lib/question-sequence-machine";
import { speakingTimePerQuestionMs } from "@/features/speaking-practice/lib/question-sequence-machine";

/** Dev wrapper: shows the one recording, the offsets and any audio failures. Nothing is uploaded. */
export function DevPart1Player({ task, timeScale }: { task: QuestionSequenceTask; timeScale: number }) {
  const [result, setResult] = useState<(QuestionSequenceResult & { url: string }) | null>(null);
  const [failures, setFailures] = useState<AudioFailure[]>([]);

  return (
    <div className="space-y-6">
      {!result && (
        <QuestionSequencePlayer
          task={task}
          timeScale={timeScale}
          onAudioFailure={(failure) => setFailures((list) => [...list, failure])}
          onFinished={(r) => setResult({ ...r, url: URL.createObjectURL(r.recording.blob) })}
        />
      )}

      {result && (
        <Card className="space-y-3" data-testid="dev-result">
          <p className="font-medium">One recording, {result.recording.mimeType}</p>
          <RecordingPlayer src={result.url} durationMs={result.recording.durationMs} label="Your recording" />
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-subtle">question_offsets_ms</dt>
            <dd className="font-mono" data-testid="offsets">
              {JSON.stringify(result.offsetsMs)}
            </dd>
            <dt className="text-subtle">recording_ms</dt>
            <dd className="font-mono" data-testid="recording-ms">
              {result.recording.durationMs}
            </dd>
            <dt className="text-subtle">time per question</dt>
            <dd className="font-mono">{JSON.stringify(speakingTimePerQuestionMs(result.offsetsMs, result.recording.durationMs))}</dd>
          </dl>
        </Card>
      )}

      <Card className="space-y-2 text-sm">
        <p className="font-medium">Audio failures (analytics events later)</p>
        <ul className="font-mono" data-testid="audio-failures">
          {failures.map((f, i) => (
            <li key={i}>
              Q{f.index + 1} {f.cue}: {f.reason}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
