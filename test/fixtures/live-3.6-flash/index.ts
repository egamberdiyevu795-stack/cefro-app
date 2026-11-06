/**
 * Live evaluator outputs from gemini-3.6-flash, NOT the production model (see README.md in this folder).
 * Offline fixtures: loading them never calls a provider.
 */
import type { SpeakingEvaluation } from "@/server/evaluation/speaking-evaluator";
import a0Below from "./A0-below-b1.json";
import a0Memorized from "./A0-memorized-off-topic.json";
import a1 from "./A1-b1-only-q3.json";
import a2 from "./A2-b1-all-three.json";
import a3 from "./A3-b2-q3-missing.json";
import a4 from "./A4-b2-all-three.json";
import a5 from "./A5-above-b2.json";

/** The evaluator's return type, without the quality-gate report (not saved by the live run). */
export type LiveFixtureEvaluation = Omit<SpeakingEvaluation, "quality">;

export interface LiveFixtureRun {
  run: number;
  /** true: the live test asserted the quality gate passed; null: that check was not reached. */
  qualityPassed: boolean | null;
  evaluation: LiveFixtureEvaluation;
}

export interface LiveFixtureFile {
  _fixture: {
    model: "gemini-3.6-flash";
    production: false;
    warning: string;
    anchor: string;
    expectedBand: number;
    bands: number[];
    runAt: string;
    commit: string;
    source: string;
    settings: string;
    savedFromRun: string[];
    rebuiltFromCode: string[];
    notSaved: string;
  };
  runs: LiveFixtureRun[];
}

/** By anchor id. JSON is typed loosely by TypeScript, so the shape is asserted here and checked by the fixture test. */
export const LIVE_36_FLASH_FIXTURES = Object.fromEntries(
  [a0Below, a0Memorized, a1, a2, a3, a4, a5].map((file) => [file._fixture.anchor, file as unknown as LiveFixtureFile]),
) as Record<string, LiveFixtureFile>;
