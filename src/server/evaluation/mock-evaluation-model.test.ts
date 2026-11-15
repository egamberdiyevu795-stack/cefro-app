import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { listSpeakingTasks } from "@/content/speaking";
import { demoAnswerText } from "@/features/demo/demo-answers";
import { demoEvaluation, demoPracticeKey } from "@/server/demo/demo-data";
import { MOCK_QUESTION_KEYWORDS } from "./mock-question-keywords";

const tasks = listSpeakingTasks();

describe("mock evaluator: question key words per task (mock mode only)", () => {
  it("every task has key words for each of its questions", () => {
    expect(Object.keys(MOCK_QUESTION_KEYWORDS).sort()).toEqual(tasks.map((t) => t.id).sort());
    for (const task of tasks) {
      const lists = MOCK_QUESTION_KEYWORDS[task.id];
      expect(lists).toHaveLength(task.prompts.length);
      for (const words of lists) {
        expect(words.length).toBeGreaterThanOrEqual(2);
        for (const word of words) expect(word).toMatch(/^[a-z]+$/);
      }
    }
  });

  it.each(tasks.map((t) => [t.title, t.id]))("%s: the full demo answer gets 3 of 3 answered, the first one leaves out question 3", async (_title, taskId) => {
    expect(demoAnswerText(taskId, "full")).toBeTruthy();
    const full = (await demoEvaluation(demoPracticeKey(taskId, demoPracticeKey(taskId, null))))!.result;
    expect(full.assessment.questions.map((q) => q.status)).toEqual(["on_topic", "on_topic", "on_topic"]);
    expect(full.scoring.on_topic_count).toBe(3);
    const first = (await demoEvaluation(demoPracticeKey(taskId, null)))!.result;
    expect(first.assessment.questions.map((q) => q.status)).toEqual(["on_topic", "on_topic", "missing"]);
    expect(first.retry_focus[0].objective).toMatch(/^Answer question 3: /);
  });

  it("is never read by real scoring: only the mock evaluator imports the key words", () => {
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        return e.isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [full] : [];
      });
    const importers = walk(path.join(process.cwd(), "src"))
      .filter((file) => /mock-question-keywords/.test(fs.readFileSync(file, "utf8")))
      .map((file) => path.relative(process.cwd(), file))
      .filter((file) => !file.endsWith("mock-question-keywords.ts"));
    expect(importers).toEqual(["src/server/evaluation/mock-evaluation-model.ts"]);
  });
});
