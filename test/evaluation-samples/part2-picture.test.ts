import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getSpeakingTask } from "@/content/speaking";
import type { MultilevelModelOutput } from "@/domain/evaluation/multilevel/model-output";
import { computeSpeechMetrics } from "@/domain/speaking/metrics";
import { toPublicTask } from "@/domain/speaking/task";
import { ensureTaskSnapshot } from "@/server/attempts/attempt-repository";
import { openDatabase, setDbForTesting } from "@/server/db/client";
import { speakingTasks } from "@/server/db/schema";
import { GeminiEvaluationModel } from "@/server/evaluation/gemini-evaluation-model";
import { buildMultilevelEvaluationPrompt } from "@/server/evaluation/prompts/multilevel-evaluation";
import { getSpeakingRubric } from "@/server/evaluation/rubrics";
import { evaluateSpeaking } from "@/server/evaluation/speaking-evaluator";
import type { EvaluationInput } from "@/server/evaluation/types";
import { EVALUATOR_VERSION } from "@/server/evaluation/versions";
import { PART2_BAND_ANCHORS } from "./part2-band-anchors";

/**
 * The Part 2 picture (evaluator 3.5.0): the picture is stored with its source and licence, the evaluator is told what
 * it shows and that describing it answers no question, and an answer that only describes it gets band 0.
 * Gemini is MOCKED here (no network): the canned reply is what a correct evaluator returns for A0-picture-only.
 */
const task = getSpeakingTask("b2-part2-advice-from-someone")!;
const rubric = getSpeakingRubric(task);
const anchor = PART2_BAND_ANCHORS.find((a) => a.id === "A0-picture-only")!;
const PICTURE_RULE = "Describing the picture (who is in it, what they are doing or wearing, where they are) does NOT answer any question";

function inputFor(sample: { transcript: string; durationMs: number }): EvaluationInput {
  return {
    task,
    rubric,
    transcript: sample.transcript,
    metrics: computeSpeechMetrics(sample.transcript, sample.durationMs, task.speakingSeconds),
    audio: { storageProvider: "none", storageKey: "k", mimeType: "audio/webm", durationMs: sample.durationMs },
    previousAttempt: null,
  };
}

/** What a correct evaluator returns for A0-picture-only: every question off topic, plain B1 language. */
function pictureOnlyOutput(): MultilevelModelOutput {
  const feature = (evidence: string[], note: string, how_to_improve: string, how_to_check: string) => ({
    level: "B1" as const,
    evidence,
    note,
    how_to_improve,
    how_to_check,
  });
  return {
    questions: [
      {
        id: 1,
        status: "off_topic",
        evidence: "I think the man is giving advice to the girl",
        note: "You describe the man in the picture, not a time someone gave YOU advice.",
        model_answer: "Last year my uncle gave me advice when I was choosing a university.",
      },
      {
        id: 2,
        status: "off_topic",
        evidence: "She is holding a notebook and she is listening to him carefully",
        note: "You say what the girl in the picture is doing, not what the advice was or if you followed it.",
        model_answer: "He told me to visit the universities first, and I followed his advice.",
      },
      {
        id: 3,
        status: "off_topic",
        evidence: "It looks like a nice, calm day",
        note: "You do not give your view about young people and advice from older people.",
        model_answer: "As for older people's advice, I think young people should / shouldn't always follow it, because …",
      },
    ],
    features: {
      grammar: feature(
        ["They are sitting on a wooden bench in a park"],
        "Your sentences are correct, but they are all simple present forms.",
        "Tell your own story in the past: 'When I was 16, my father told me to …'.",
        "Your next answer has at least three past verbs about your own story.",
      ),
      vocabulary: feature(
        ["The man has grey hair and glasses"],
        "You use clear everyday words to describe people.",
        "Use topic phrases such as 'take someone's advice' and 'looking back'.",
        "You hear 'take someone's advice' or 'looking back' when you listen back.",
      ),
      fluency: feature(
        ["It looks like a nice, calm day"],
        "You speak without fillers, but your answer is a list of things in the picture.",
        "Plan the first sentence of each answer during preparation, so you start with your own story.",
        "Your first sentence is about a time someone gave you advice.",
      ),
      cohesion: feature(
        ["He is raising his hand, so I think the man is giving advice to the girl"],
        "You link ideas with 'and' and 'so'.",
        "Link two ideas with 'however' or 'as a result'.",
        "You use 'however' or 'as a result' at least once.",
      ),
      pronunciation: { level: "not_assessed", evidence: [], note: "", how_to_improve: "", how_to_check: "" },
    },
    memorized_or_irrelevant: false,
    errors: [],
    error_patterns: [],
    strengths: [],
    retry_review: null,
  };
}

function geminiReply(output: unknown) {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(output) }] }, finishReason: "STOP", index: 0 }],
      usageMetadata: { promptTokenCount: 9000, candidatesTokenCount: 2500, thoughtsTokenCount: 4000, totalTokenCount: 15500 },
      modelVersion: "gemini-3.8-flash",
      responseId: "mock",
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function mockedGemini() {
  const fetchMock = vi.fn(async () => geminiReply(pictureOnlyOutput()));
  const model = new GeminiEvaluationModel({
    apiKey: "test-key-not-real-0123456789",
    model: "gemini-3.8-flash",
    maxTokens: 24000,
    structuredOutput: "schema",
    timeoutMs: 5_000,
    maxRetries: 0,
    fetch: fetchMock as unknown as typeof fetch,
  });
  return { model, fetchMock };
}

describe("Part 2 picture (evaluator 3.5.0)", () => {
  afterEach(() => setDbForTesting(undefined));

  it("is evaluator 3.5.0", () => {
    expect(EVALUATOR_VERSION).toBe("speaking-evaluator/3.5.0");
  });

  it("A0-picture-only on mocked Gemini: all three questions off topic → band 0", async () => {
    const { model, fetchMock } = mockedGemini();
    const evaluation = await evaluateSpeaking(inputFor(anchor), model);

    expect(fetchMock).toHaveBeenCalledTimes(1); // accepted first time: no regeneration
    expect(evaluation.quality.passed).toBe(true);
    expect(evaluation.result.assessment.questions.map((q) => q.status)).toEqual(["off_topic", "off_topic", "off_topic"]);
    expect(evaluation.result.scoring).toMatchObject({ band: anchor.expect.band, on_topic_count: 0, zero_reason: "no_question_on_topic" });
    expect(evaluation.result.scoring.band).toBe(0);
    expect(evaluation.evaluatorVersion).toBe("speaking-evaluator/3.5.0");
    // Tokens are passed through for the cost report: thinking counts as output.
    expect(evaluation).toMatchObject({ inputTokens: 9000, outputTokens: 6500 });
  });

  it("the anchor really describes only the picture, including the word 'advice'", () => {
    expect(anchor.transcript).toContain("the man is giving advice to the girl");
    expect(anchor.expect).toMatchObject({ band: 0, questions: ["off_topic", "off_topic", "off_topic"] });
  });

  it("the request sent to Gemini includes what the picture shows and the picture rule", async () => {
    const { model, fetchMock } = mockedGemini();
    await evaluateSpeaking(inputFor(anchor), model);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    const user: string = body.contents[0].parts[0].text;
    const system: string = body.systemInstruction.parts[0].text;

    const taskSection = user.split("<task>")[1].split("</task>")[0];
    expect(taskSection).toContain(`Picture shown to the student (it only sets the scene; describing it answers no question): ${task.picture!.alt}`);
    expect(system).toContain(PICTURE_RULE);
    expect(system).toContain('even when the description uses the topic\'s words (e.g. "the man is giving advice to the girl")');
    expect(system).toContain("An answer that only describes the picture leaves every question off_topic.");
    expect(user).toContain("Describing it (e.g. 'the man is giving advice to the girl', 'they are sitting on a bench') answers none of the questions");
  });

  it("a task without a picture gets no picture line", () => {
    const { picture: _omit, ...noPicture } = task;
    void _omit;
    const prompt = buildMultilevelEvaluationPrompt({ ...inputFor(anchor), task: noPicture });
    expect(prompt.user).not.toContain("Picture shown to the student");
  });

  it("the picture's source and licence are on the task, sent to the browser and listed in public/tasks/README.md", () => {
    const picture = task.picture!;
    expect(task.version).toBe(2);
    expect(picture).toMatchObject({
      src: "/tasks/advice-from-someone.svg",
      licence: "CC0 1.0",
      licenceUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    });
    expect(picture.source).toMatch(/Original illustration made for CEFRO/);
    expect(picture.alt).toMatch(/older man/);
    expect(picture.alt).toMatch(/girl/);
    expect(toPublicTask(task).picture).toEqual(picture);

    const file = path.join(process.cwd(), "public", picture.src);
    expect(fs.existsSync(file)).toBe(true);
    const svg = fs.readFileSync(file, "utf8");
    expect(svg).toContain(`viewBox="0 0 ${picture.width} ${picture.height}"`);
    expect(svg).not.toMatch(/<script|href=|xlink:|<image|url\(/i); // self-contained, no external or active content
    expect(svg).toContain("CC0 1.0");

    const readme = fs.readFileSync(path.join(process.cwd(), "public", "tasks", "README.md"), "utf8");
    const row = readme.split("\n").find((line) => line.startsWith(`| \`${path.basename(picture.src)}\``));
    expect(row, "README row for the picture").toBeDefined();
    expect(row).toContain(task.id);
    expect(row).toContain(picture.source);
    expect(row).toContain(`[${picture.licence}](${picture.licenceUrl})`);
  });

  it("the stored task snapshot keeps the picture with its source and licence", async () => {
    const db = await openDatabase(":memory:");
    setDbForTesting(db);
    await ensureTaskSnapshot(task);
    const rows = await db.select().from(speakingTasks).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: task.id, version: 2 });
    expect((rows[0].content as typeof task).picture).toEqual(task.picture);
  });
});
