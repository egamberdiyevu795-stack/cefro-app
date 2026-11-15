#!/usr/bin/env node
/**
 * Counts the docs/feedback-review.md issues in saved evaluator outputs. Calls no model.
 *
 *   node scripts/check-feedback-review.mjs test/fixtures/live-3.6-flash          # the saved 3.6-flash fixtures
 *   node scripts/check-feedback-review.mjs eval-reports/evaluation-set-<stamp>.json   # a live run's report
 *
 * Issue 1: the biggest-fix goal is about a different issue from the first error of that feature (printed for a human
 *          to read, plus an automatic flag when the goal or check joins two quoted structures with "and"/"or").
 * Issue 2: a transcript-only fluency text claims smoothness, pauses, fillers or speed.
 * Issue 3: a quoted example inside advice uses the task's own topic words (a quoted task question is allowed).
 * Issue 4: a check requires a set phrase.
 * Issue 5: A0-below-b1 levels and band per run.
 */
import fs from "node:fs";
import path from "node:path";

const target = process.argv[2];
if (!target) {
  console.error("usage: node scripts/check-feedback-review.mjs <fixtures dir | report.json>");
  process.exit(2);
}

/** @returns {{ id: string, run: number, result: any }[]} */
function loadRuns(p) {
  const out = [];
  if (fs.statSync(p).isDirectory()) {
    for (const f of fs.readdirSync(p).filter((f) => f.endsWith(".json")).sort()) {
      const d = JSON.parse(fs.readFileSync(path.join(p, f), "utf8"));
      for (const r of d.runs ?? []) if (r.evaluation?.result) out.push({ id: d._fixture?.anchor ?? f, run: r.run, result: r.evaluation.result });
    }
  } else {
    for (const row of JSON.parse(fs.readFileSync(p, "utf8"))) {
      (row.results ?? []).forEach((result, i) => result && out.push({ id: row.id, run: i + 1, result }));
    }
  }
  return out;
}

const FLUENCY_CLAIM = /smooth|fluent|without (any |noticeable |visible |major )?(pauses?|hesitations?|fillers?)|\bpace\b|\bslow|\bfast|speed/i;
const SET_PHRASE = /(start(s|ing)? with|contains? (at least one|the)|include (a|the) (structure|phrase|sentence))\s.*'[^']+'/i;
// Two different structures joined in one goal or check. (Until 15 Nov this also flagged any two quoted words joined by
// "and"/"or", which counted lists of examples of ONE rule, e.g. "'gave', 'wanted', and 'said'", as two issues.)
const STRUCTURE = String.raw`(conditionals?|relative clauses?|passives?|participle clauses?|cleft sentences?|inversion|linking (words?|phrases?)|modal verbs?|reported speech|past perfect|present perfect)`;
const TWO_STRUCTURES = new RegExp(String.raw`\b${STRUCTURE}\b[^.]*\b(and|or)\b[^.]*\b${STRUCTURE}\b|\b${STRUCTURE}\b[^.]*\b(or|and)\b[^.]*'[^']+'\s*\(?\s*(who|which|that)\b`, "i");
const TASK_WORDS = /\b(advice|advise[ds]?|older|young people|follow(ed|ing)? (his|her|their|my) advice)\b/i;
const QUOTED = /['"‘“]([^'"’”]{12,})['"’”]/g;

const runs = loadRuns(target);
const counts = { runs: runs.length, issue1: 0, issue2: 0, issue3: 0, issue4: 0 };
const lines = [];

for (const { id, run, result } of runs) {
  const tag = `${id} r${run}`;
  const a = result.assessment ?? {};
  const f = a.features ?? {};
  const flags = [];

  // Issue 2
  if (result.audio?.status !== "assessed") {
    const fl = f.fluency ?? {};
    const hits = ["note", "how_to_improve", "how_to_check"].filter((k) => FLUENCY_CLAIM.test(fl[k] ?? ""));
    if (hits.length) {
      counts.issue2++;
      flags.push(`2 fluency claim (${hits.join(", ")}): "${fl[hits[0]]}"`);
    }
  }

  // Issue 3
  const adviceTexts = [];
  for (const [name, feat] of Object.entries(f)) for (const k of ["how_to_improve", "how_to_check"]) if (feat?.[k]) adviceTexts.push([`${name}.${k}`, feat[k]]);
  for (const p of a.error_patterns ?? []) for (const k of ["rule", "how_to_fix"]) if (p?.[k]) adviceTexts.push([`pattern.${k}`, p[k]]);
  for (const rf of result.retry_focus ?? []) for (const k of ["objective", "success_check"]) if (rf?.[k]) adviceTexts.push([`retry.${k}`, rf[k]]);
  const onTopic = [];
  for (const [where, text] of adviceTexts) for (const m of text.matchAll(QUOTED)) if (TASK_WORDS.test(m[1]) && !m[1].trim().endsWith("?")) onTopic.push(`${where}: '${m[1]}'`);
  if (onTopic.length) {
    counts.issue3++;
    flags.push(`3 on-topic example: ${[...new Set(onTopic)].join(" | ")}`);
  }

  // Issue 4
  const checks = [
    ...Object.entries(f).map(([n, feat]) => [`${n}.how_to_check`, feat?.how_to_check ?? ""]),
    ...(result.retry_focus ?? []).map((rf, i) => [`retry${i + 1}.success_check`, rf?.success_check ?? ""]),
  ].filter(([, t]) => SET_PHRASE.test(t));
  if (checks.length) {
    counts.issue4++;
    flags.push(`4 set phrase: ${checks.map(([w, t]) => `${w}: "${t}"`).join(" | ")}`);
  }

  // Issue 1
  const goal = (result.retry_focus ?? [])[0];
  const fix = result.scoring?.biggest_fix;
  if (goal && fix?.kind === "feature" && (fix.feature === "grammar" || fix.feature === "vocabulary")) {
    const err = (a.errors ?? []).find((e) => e.type === fix.feature);
    const joined = TWO_STRUCTURES.test(goal.objective ?? "") || TWO_STRUCTURES.test(goal.success_check ?? "");
    if (joined) counts.issue1++;
    flags.push(
      `1 ${joined ? "TWO ISSUES " : ""}read: error ${err ? `"${err.quote}" → "${err.correction}"` : "(none of this feature)"} · goal "${goal.objective}" · check "${goal.success_check}"`,
    );
  }

  const s = result.scoring ?? {};
  const lv = ["grammar", "vocabulary", "fluency", "cohesion"].map((k) => f[k]?.level ?? "?").join("/");
  lines.push(`### ${tag}: band ${s.band} (${s.label}), ${lv}, language ${s.language_level} mean ${s.language_mean}`);
  for (const fl of flags) lines.push(`- ${fl}`);
  lines.push("");
}

console.log(lines.join("\n"));
console.log(
  `Runs: ${counts.runs} · issue 1 (goal joins two issues): ${counts.issue1} · issue 2 (fluency claim, transcript-only): ${counts.issue2} · issue 3 (on-topic example): ${counts.issue3} · issue 4 (set phrase in a check): ${counts.issue4}`,
);
