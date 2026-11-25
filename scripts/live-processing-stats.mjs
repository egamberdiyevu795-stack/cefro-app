// How long scoring takes in production: read-only, aggregates only (no ids, no user data, no transcripts), because the
// workflow log of this public repository is public. Run by .github/workflows/processing-stats.yml.
// Usage: TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=… node scripts/live-processing-stats.mjs [days]
import { createClient } from "@libsql/client";

const days = Number(process.argv[2] ?? 14);
const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  console.error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required.");
  process.exit(1);
}
const client = createClient({ url, authToken });
const since = new Date(Date.now() - days * 86_400_000).toISOString();
const all = async (sql, args = []) => (await client.execute({ sql, args })).rows;

const pct = (values, p) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};
const s = (ms) => (ms == null ? "—" : `${(Number(ms) / 1000).toFixed(1)}s`);
const line = (label, values) => {
  const v = values.map(Number).filter((n) => Number.isFinite(n));
  console.log(`  ${label.padEnd(30)} n=${String(v.length).padEnd(5)} p50=${s(pct(v, 50)).padEnd(7)} p90=${s(pct(v, 90)).padEnd(7)} max=${s(pct(v, 100))}`);
};
const part = (taskId) => (/part1-1/.test(taskId) ? "1.1" : /part1-2/.test(taskId) ? "1.2" : /part2/.test(taskId) ? "2" : /part3/.test(taskId) ? "3" : "other");

console.log(`Scoring times, last ${days} days (since ${since.slice(0, 10)})\n`);

const attempts = await all(
  `select task_id, status, failure_code, processing_runs, processing_duration_ms,
          (julianday(completed_at) - julianday(created_at)) * 86400000 as wait_ms
   from speaking_attempts where created_at >= ?`,
  [since],
);
console.log(`Attempts: ${attempts.length}`);
for (const [status, rows] of Object.entries(Object.groupBy(attempts, (a) => a.status))) console.log(`  ${status.padEnd(12)} ${rows.length}`);
for (const [code, rows] of Object.entries(Object.groupBy(attempts.filter((a) => a.failure_code), (a) => a.failure_code))) {
  console.log(`    failure ${String(code).padEnd(28)} ${rows.length}`);
}

const done = attempts.filter((a) => a.status === "completed");
console.log("\nWhat the student waits (upload → result), completed attempts");
line("all parts", done.map((a) => a.wait_ms));
for (const p of ["1.1", "1.2", "2", "3"]) line(`Part ${p}`, done.filter((a) => part(a.task_id) === p).map((a) => a.wait_ms));
line("last processing run only", done.map((a) => a.processing_duration_ms));

const runs = Object.groupBy(done, (a) => String(a.processing_runs));
console.log("\nProcessing runs per completed attempt (more than 1 = a run failed or stalled and was started again)");
for (const [n, rows] of Object.entries(runs)) console.log(`  ${n} run(s): ${rows.length}`);
line("wait when 1 run", (runs["1"] ?? []).map((a) => a.wait_ms));
line("wait when 2+ runs", done.filter((a) => Number(a.processing_runs) > 1).map((a) => a.wait_ms));

const transcripts = await all(`select latency_ms from transcripts where created_at >= ? and latency_ms is not null`, [since]);
const evaluations = await all(`select latency_ms, model_calls, model from evaluations where created_at >= ? and latency_ms is not null`, [since]);
console.log("\nSteps");
line("writing down (transcription)", transcripts.map((r) => r.latency_ms));
line("scoring (evaluation)", evaluations.map((r) => r.latency_ms));
line("scoring, 1 model call", evaluations.filter((r) => Number(r.model_calls) === 1).map((r) => r.latency_ms));
line("scoring, 2+ model calls", evaluations.filter((r) => Number(r.model_calls) > 1).map((r) => r.latency_ms));
const regenerated = evaluations.filter((r) => Number(r.model_calls) > 1).length;
console.log(`  regenerated (asked Gemini twice): ${regenerated} of ${evaluations.length}`);
for (const [model, rows] of Object.entries(Object.groupBy(evaluations, (r) => String(r.model)))) console.log(`  model ${model}: ${rows.length}`);
