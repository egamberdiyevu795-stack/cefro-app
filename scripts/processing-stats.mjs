// Processing cost/latency summary from the local database.
// Usage: npm run stats   (reads DATABASE_PATH or ./data/cefro.db)
import fs from "node:fs";
import Database from "better-sqlite3";

for (const file of [".env.local", ".env"]) if (fs.existsSync(file)) process.loadEnvFile(file);
const dbPath = process.env.DATABASE_PATH ?? "./data/cefro.db";
if (!fs.existsSync(dbPath)) {
  console.log(`No database at ${dbPath} yet.`);
  process.exit(0);
}
const db = new Database(dbPath, { readonly: true });

const pct = (values, p) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};
const fmt = (ms) => (ms == null ? "—" : `${(ms / 1000).toFixed(1)}s`);
const summary = (label, values) =>
  console.log(`  ${label.padEnd(22)} n=${String(values.length).padEnd(5)} p50=${fmt(pct(values, 50)).padEnd(7)} p95=${fmt(pct(values, 95))}`);

const attempts = db.prepare("select status, failure_code, processing_duration_ms from speaking_attempts").all();
console.log(`\nAttempts: ${attempts.length}`);
const byStatus = Object.groupBy(attempts, (a) => a.status);
for (const [status, rows] of Object.entries(byStatus)) console.log(`  ${status.padEnd(12)} ${rows.length}`);
const failures = Object.groupBy(attempts.filter((a) => a.failure_code), (a) => a.failure_code);
for (const [code, rows] of Object.entries(failures)) console.log(`    failure ${code.padEnd(28)} ${rows.length}`);

console.log("\nLatency");
summary("transcription", db.prepare("select latency_ms v from transcripts where latency_ms is not null").all().map((r) => r.v));
summary("evaluation", db.prepare("select latency_ms v from evaluations where latency_ms is not null").all().map((r) => r.v));
summary("total (completed)", attempts.filter((a) => a.status === "completed" && a.processing_duration_ms != null).map((a) => a.processing_duration_ms));

console.log("\nEvaluations by evaluator / model");
const rows = db
  .prepare(
    `select evaluator_version, provider, model, count(*) n, avg(input_tokens) tin, avg(output_tokens) tout,
            sum(case when model_calls > 1 then 1 else 0 end) regenerated
       from evaluations group by evaluator_version, provider, model`,
  )
  .all();
for (const r of rows) {
  console.log(
    `  ${r.evaluator_version} ${r.provider}/${r.model}: n=${r.n}, avg tokens in/out=${Math.round(r.tin ?? 0)}/${Math.round(r.tout ?? 0)}, regenerated=${r.regenerated}`,
  );
}

const warnings = {};
for (const { quality_report } of db.prepare("select quality_report from evaluations where quality_report is not null").all()) {
  const report = JSON.parse(quality_report);
  for (const v of report.warnings ?? []) warnings[v.code] = (warnings[v.code] ?? 0) + 1;
  for (const draft of report.rejectedDrafts ?? []) for (const v of draft) warnings[`rejected:${v.code}`] = (warnings[`rejected:${v.code}`] ?? 0) + 1;
}
console.log("\nQuality gate findings");
if (Object.keys(warnings).length === 0) console.log("  none");
for (const [code, n] of Object.entries(warnings).sort((a, b) => b[1] - a[1])) console.log(`  ${code.padEnd(36)} ${n}`);
console.log("");
