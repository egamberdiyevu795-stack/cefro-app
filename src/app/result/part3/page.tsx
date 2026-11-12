import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FEATURE_FLAGS, allFlags, type FeatureFlags } from "@/config/features";
import { toPublicArgumentTask } from "@/domain/speaking/argument-task";
import { isMockQuery } from "@/features/demo/demo-mode";
import { part3PracticeHref, part3ResultHref } from "@/features/part3/links";
import { Part3ScoredResult } from "@/features/part3/result-sections";
import { buildPart3View } from "@/features/part3/view-model";
import { AutoAdvance } from "@/features/result/AutoAdvance";
import { ScoringResult } from "@/features/result/sections";
import { AppShell } from "@/features/shell/AppShell";
import { part3DemoEvaluation, part3DemoSpec, part3DemoTranscriptFor } from "@/server/demo/part3-demo";
import { demoYourTeacher } from "@/server/demo/demo-mock";
import { durationOf } from "@/server/demo/demo-data";
import { getArgumentRubric } from "@/server/evaluation/rubrics/q8";

export const metadata: Metadata = { title: "Your Part 3 result" };

/*
 * A Part 3 demo result, mock mode only (`?mock=1`): `?demo=<key>` (features/part3/links.ts), produced by the real
 * Part 3 evaluation with the Part 3 mock evaluator for the points the student chose. `&state=scoring&next=1` shows
 * "Scoring…" first and then opens the result. Every link keeps ?mock=1.
 */
export default async function Part3ResultPage(props: PageProps<"/result/part3">) {
  const query = await props.searchParams;
  if (!isMockQuery(query)) notFound();
  const key = typeof query.demo === "string" ? query.demo : "";
  const spec = part3DemoSpec(key);
  const evaluation = spec ? await part3DemoEvaluation(key) : null;
  if (!spec || !evaluation) notFound();
  const flags: FeatureFlags = query.flags === "off" ? allFlags(false) : FEATURE_FLAGS;
  const task = toPublicArgumentTask(spec.task);
  const transcript = part3DemoTranscriptFor(spec);
  const previous = spec.previous ? await part3DemoEvaluation(spec.previous) : null;

  if (query.state === "scoring") {
    return (
      <AppShell flags={flags} account="mock">
        <ScoringResult
          demo
          state={{
            kind: "scoring",
            task: { id: task.id, title: task.title, part: task.part, prompts: [] },
            step: "scoring",
            transcript,
            durationMs: durationOf(transcript),
            goal: previous?.result.retry_focus[0]?.objective ?? null,
          }}
        />
        {query.next === "1" && <AutoAdvance href={part3ResultHref(key)} />}
      </AppShell>
    );
  }

  const view = buildPart3View(evaluation.result, {
    task,
    transcript,
    durationMs: durationOf(transcript),
    bandLabels: getArgumentRubric(spec.task).config.bands,
    previous: previous?.result ?? null,
    isDevelopmentProvider: evaluation.isDevelopmentProvider,
  });
  return (
    <AppShell flags={flags} account="mock">
      <Part3ScoredResult
        view={view}
        retryHref={part3PracticeHref(task.id, { retry: key })}
        demo
        yourTeacher={query.teacher === "1" ? demoYourTeacher(view.band, getArgumentRubric(spec.task).config.bands) : null}
      />
    </AppShell>
  );
}
