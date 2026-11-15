import "server-only";
/**
 * The Part 3 mock demo (`?mock=1`): each demo result is produced for its own topic and the points the student
 * chose. The made-up demo answer (`features/demo/part3-demo-answers.ts`) goes through the real Part 3 evaluation
 * (`evaluateArgument`) with the Part 3 mock evaluator (no delay, no model call), so it is a real `ArgumentEvaluation`
 * / `Q8Result`. Nothing reads or writes the database. Results are computed once per key and process.
 */
import { getArgumentTask } from "@/content/speaking/part3";
import { computeSpeechMetrics } from "@/domain/speaking/metrics";
import type { BalancedArgumentTask, PointId } from "@/domain/speaking/argument-task";
import { DEFAULT_POINTS, part3DemoTranscript, type Part3DemoVariant } from "@/features/demo/part3-demo-answers";
import { parsePart3Key, previousPart3Key } from "@/features/part3/links";
import { evaluateArgument, type ArgumentEvaluation } from "@/server/evaluation/argument-evaluator";
import { MockArgumentModel } from "@/server/evaluation/mock-argument-model";
import { getArgumentRubric } from "@/server/evaluation/rubrics/q8";
import { durationOf } from "./demo-data";

export interface Part3DemoSpec {
  key: string;
  task: BalancedArgumentTask;
  /** The points the student ticked (as encoded in the key). */
  chosen: PointId[];
  /** The points the demo answer talks about: the ticked ones, or the first two of a side with none ticked. */
  spoken: PointId[];
  variant: Part3DemoVariant;
  previous: string | null;
}

/** Reads a Part 3 demo key; null for anything else. */
export function part3DemoSpec(key: string): Part3DemoSpec | null {
  const parsed = parsePart3Key(key);
  const task = parsed ? getArgumentTask(parsed.taskId) : undefined;
  if (!parsed || !task) return null;
  const chosen = parsed.attempts.at(-1)!;
  const hasFor = chosen.some((id) => id.startsWith("F"));
  const hasAgainst = chosen.some((id) => id.startsWith("A"));
  const spoken = [
    ...(hasFor ? chosen.filter((id) => id.startsWith("F")) : DEFAULT_POINTS.filter((id) => id.startsWith("F"))),
    ...(hasAgainst ? chosen.filter((id) => id.startsWith("A")) : DEFAULT_POINTS.filter((id) => id.startsWith("A"))),
  ];
  return { key, task, chosen, spoken, variant: parsed.attempts.length === 1 ? "first" : "full", previous: previousPart3Key(key) };
}

export function part3DemoTranscriptFor(spec: Part3DemoSpec): string {
  return part3DemoTranscript(spec.task.id, spec.spoken, spec.variant, spec.task) ?? "";
}

const cache = new Map<string, Promise<ArgumentEvaluation | null>>();

/** The evaluation of a demo key (computed once); null for an unknown key. */
export function part3DemoEvaluation(key: string): Promise<ArgumentEvaluation | null> {
  let pending = cache.get(key);
  if (!pending) {
    pending = evaluate(key);
    cache.set(key, pending);
  }
  return pending;
}

async function evaluate(key: string): Promise<ArgumentEvaluation | null> {
  const spec = part3DemoSpec(key);
  if (!spec) return null;
  const previousSpec = spec.previous ? part3DemoSpec(spec.previous) : null;
  const previous = spec.previous ? await part3DemoEvaluation(spec.previous) : null;
  const transcript = part3DemoTranscriptFor(spec);
  const durationMs = durationOf(transcript);
  return evaluateArgument(
    {
      task: spec.task,
      rubric: getArgumentRubric(spec.task),
      transcript,
      metrics: computeSpeechMetrics(transcript, durationMs, spec.task.speakingSeconds),
      chosenPoints: spec.chosen,
      audio: { storageProvider: "demo", storageKey: key, mimeType: "audio/webm", durationMs },
      previousAttempt:
        previous && previousSpec
          ? {
              attemptNumber: 1,
              transcript: part3DemoTranscriptFor(previousSpec),
              retryFocus: previous.result.retry_focus.map(({ objective, success_check }) => ({ objective, success_check })),
            }
          : null,
    },
    new MockArgumentModel({ delayMs: 0 }),
  );
}
