// Pure summaries for the owner's scoring report (scripts/scoring-report.mjs, workflow "Scoring report"), shared with its
// unit test. Counts only: no ids, names, emails, transcripts or exact times ever reach these functions' output.
//
// 1. Is AI scoring working in production? (attempts by part: scored by a real model, failed and why, still running)
// 2. Does the app agree with the teacher? (the teacher's Agree / Choose level on each part attempt, and on whole mocks)

const pct = (n, d) => (d === 0 ? "—" : `${Math.round((n / d) * 100)}%`);
const pad = (v, n) => String(v).padEnd(n);
const partLabel = (part) => (part === null || part === undefined || part === "" ? "Part unknown" : `Part ${part}`);
const byPart = (rows) => {
  const parts = [...new Set(rows.map((r) => (r.part === undefined || r.part === "" ? null : r.part)))];
  parts.sort((a, b) => String(a ?? "9").localeCompare(String(b ?? "9"), "en", { numeric: true }));
  return parts.map((part) => [part, rows.filter((r) => (r.part === undefined || r.part === "" ? null : r.part) === part)]);
};

/**
 * Rows: { part, status, failureStage, failureCode, provider } per attempt (provider = the newest evaluation's, or null).
 * "scored (real)" = completed with a non-mock evaluation; "no AI score" = completed without one (transcript saved, the
 * result says "AI score not ready yet"); "failed" = status failed, split by stage and code.
 */
export function scoringHealth(rows) {
  const line = (label, list) => {
    const real = list.filter((r) => r.status === "completed" && r.provider && r.provider !== "mock").length;
    const mock = list.filter((r) => r.status === "completed" && r.provider === "mock").length;
    const unscored = list.filter((r) => r.status === "completed" && !r.provider).length;
    const failed = list.filter((r) => r.status === "failed").length;
    const running = list.length - real - mock - unscored - failed;
    return `  ${pad(label, 14)} attempts=${pad(list.length, 5)} scored(real)=${pad(real, 5)} no-AI-score=${pad(unscored, 5)} failed=${pad(failed, 4)} running=${pad(running, 4)}${mock ? ` mock=${mock}` : ""}`;
  };
  const lines = [line("All parts", rows), ...byPart(rows).map(([part, list]) => line(partLabel(part), list))];
  const failures = new Map();
  for (const r of rows.filter((x) => x.status === "failed")) {
    const key = `${r.failureStage ?? "unknown stage"}: ${r.failureCode ?? "no code"}`;
    failures.set(key, (failures.get(key) ?? 0) + 1);
  }
  if (failures.size > 0) {
    lines.push("  Failures:");
    for (const [key, n] of [...failures].sort((a, b) => b[1] - a[1])) lines.push(`    ${pad(n, 4)} ${key}`);
  }
  const providers = new Map();
  for (const r of rows.filter((x) => x.provider)) providers.set(r.provider, (providers.get(r.provider) ?? 0) + 1);
  if (providers.size > 0) lines.push(`  Scored by: ${[...providers].map(([p, n]) => `${p}=${n}`).join(", ")}`);
  const formats = recordingFormats(rows);
  if (formats.length > 0) lines.push("  By recording format (audio/mp4 = iPhone / Safari, audio/webm = Chrome / Android):", ...formats);
  return lines;
}

/** "audio/webm;codecs=opus" -> "audio/webm"; missing -> "no recording". */
const formatOf = (mime) => (mime ? String(mime).split(";")[0].trim().toLowerCase() : "no recording");
const lengthOf = (ms) => (ms === null || ms === undefined ? "?" : ms < 10_000 ? "<10s" : ms < 60_000 ? "10-60s" : ">=60s");

/** One line per recording format: attempts, scored, failed (by code), and how long the failed recordings were. */
export function recordingFormats(rows) {
  const out = [];
  const groups = new Map();
  for (const r of rows) {
    const key = formatOf(r.mimeType);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  for (const [format, list] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    const scored = list.filter((r) => r.status === "completed").length;
    const failed = list.filter((r) => r.status === "failed");
    const codes = new Map();
    for (const r of failed) {
      const key = `${r.failureCode ?? "no code"} ${lengthOf(r.durationMs)}`;
      codes.set(key, (codes.get(key) ?? 0) + 1);
    }
    const detail = codes.size ? ` (${[...codes].map(([k, n]) => `${n}x ${k}`).join(", ")})` : "";
    out.push(`    ${pad(format, 13)} attempts=${pad(list.length, 4)} completed=${pad(scored, 4)} failed=${failed.length}${detail}`);
  }
  return out;
}

/** The teacher's band: the app's band when they pressed Agree. */
export const teacherBandOf = (r) => (r.agrees === 1 || r.agrees === true ? r.appBand : r.teacherBand);

/**
 * Rows: { part, appBand, agrees, teacherBand } per rated part attempt (0–5 bands), live ratings and the anonymous pairs
 * kept after a student left a class alike. Exact = same band; within one = |difference| <= 1; "app higher" means the
 * app gave the higher band (it was too generous, if the teacher is right).
 */
export function agreementSummary(rows) {
  const line = (label, list) => {
    const pairs = list.map((r) => ({ app: Number(r.appBand), teacher: Number(teacherBandOf(r)) })).filter((p) => Number.isFinite(p.app) && Number.isFinite(p.teacher));
    const n = pairs.length;
    const exact = pairs.filter((p) => p.app === p.teacher).length;
    const within = pairs.filter((p) => Math.abs(p.app - p.teacher) <= 1).length;
    const higher = pairs.filter((p) => p.app > p.teacher).length;
    const lower = pairs.filter((p) => p.app < p.teacher).length;
    const mean = n === 0 ? "—" : (pairs.reduce((s, p) => s + (p.app - p.teacher), 0) / n).toFixed(2);
    return `  ${pad(label, 14)} rated=${pad(n, 5)} exact=${pad(`${exact} (${pct(exact, n)})`, 11)} within-1=${pad(`${within} (${pct(within, n)})`, 11)} app-higher=${pad(higher, 4)} app-lower=${pad(lower, 4)} mean(app-teacher)=${mean}`;
  };
  return [line("All parts", rows), ...byPart(rows).map(([part, list]) => line(partLabel(part), list))];
}

const LEVELS = ["Below B1", "B1", "B2", "C1"];

/** Rows: { appLevel, agrees, teacherLevel } per rated whole mock. A mock rated while the estimate was not ready is counted apart. */
export function mockAgreementSummary(rows) {
  const usable = rows.filter((r) => r.appLevel);
  const pairs = usable.map((r) => ({ app: LEVELS.indexOf(r.appLevel), teacher: LEVELS.indexOf(r.agrees === 1 || r.agrees === true ? r.appLevel : r.teacherLevel) }));
  const n = pairs.length;
  const exact = pairs.filter((p) => p.app === p.teacher).length;
  const higher = pairs.filter((p) => p.app > p.teacher).length;
  const lower = pairs.filter((p) => p.app < p.teacher).length;
  return [
    `  Whole mocks    rated=${pad(n, 5)} same level=${pad(`${exact} (${pct(exact, n)})`, 11)} app-higher=${pad(higher, 4)} app-lower=${pad(lower, 4)} rated before the estimate was ready=${rows.length - n}`,
  ];
}
