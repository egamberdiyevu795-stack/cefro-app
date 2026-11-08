#!/usr/bin/env node
/**
 * Runs the live evaluation set (test/live/evaluation-set.live.test.ts) with the live vitest config.
 *
 *   npm run eval:live                      # real run: costs money, needs EVALUATION_PROVIDER and its key
 *   npm run eval:live -- --dry-run         # prints what it would send and the estimated cost; calls no model
 *   EVAL_SAMPLES=NEW npm run eval:live -- --dry-run
 *
 * `--dry-run` sets EVAL_DRY_RUN=1 and removes every provider key from the run's environment, so nothing can be sent
 * even by mistake. Other arguments are passed to vitest.
 */
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const rest = args.filter((a) => a !== "--dry-run");
const env = { ...process.env };
if (dryRun) {
  env.EVAL_DRY_RUN = "1";
  for (const key of ["GEMINI_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"]) delete env[key];
}
const result = spawnSync(
  "npx",
  ["vitest", "run", "--config", "vitest.live.config.mts", "test/live/evaluation-set.live.test.ts", ...rest],
  { stdio: "inherit", env },
);
process.exit(result.status ?? 1);
