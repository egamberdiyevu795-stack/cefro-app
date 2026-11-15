import { describe, expect, it } from "vitest";
import { getArgumentTask } from "@/content/speaking/part3";
import { toPublicArgumentTask } from "@/domain/speaking/argument-task";
import { buildPart3View } from "@/features/part3/view-model";
import { part3DemoEvaluation, part3DemoSpec, part3DemoTranscriptFor } from "@/server/demo/part3-demo";
import { nextPart3Key } from "@/features/part3/links";
import { DEFAULT_POINTS } from "@/features/demo/part3-demo-answers";
import { getArgumentRubric } from "@/server/evaluation/rubrics/q8";
import { part3TranscriptFixes } from "./part3-fixes";

describe("T6's Part 3 card", () => {
  it("has the same transcript view as the Part 3 result page: sentences to improve and the dotted underline for copied words", async () => {
    const key = nextPart3Key("c1-part3-cars-in-city-centres", DEFAULT_POINTS, null);
    const spec = part3DemoSpec(key)!;
    const evaluation = (await part3DemoEvaluation(key))!;
    const task = toPublicArgumentTask(getArgumentTask(spec.task.id)!);
    const transcript = part3DemoTranscriptFor(spec);
    const bands = getArgumentRubric(spec.task).config.bands;
    const mine = part3TranscriptFixes(evaluation.result, task, transcript, bands);
    const theirs = buildPart3View(evaluation.result, { task, transcript, durationMs: 1, bandLabels: bands, previous: null, isDevelopmentProvider: false }).transcriptFixes;
    expect(mine).toEqual(theirs);
  });

  it("marks words read from the lists with the dotted underline (the demo answers copy nothing, so a run is put in)", async () => {
    const key = nextPart3Key("c1-part3-cars-in-city-centres", DEFAULT_POINTS, null);
    const spec = part3DemoSpec(key)!;
    const evaluation = (await part3DemoEvaluation(key))!;
    const task = toPublicArgumentTask(getArgumentTask(spec.task.id)!);
    const transcript = part3DemoTranscriptFor(spec);
    const bands = getArgumentRubric(spec.task).config.bands;
    const result = { ...evaluation.result, overlap: { ...evaluation.result.overlap, copied_spans: ["whether cities should ban private cars"] } };
    const view = part3TranscriptFixes(result, task, transcript, bands);
    const copied = view?.units.flatMap((u) => u.pieces.filter((p) => p.copied)) ?? [];
    expect(copied.map((p) => p.text.toLowerCase())).toEqual(["whether cities should ban private cars"]);
  });
});
