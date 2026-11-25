#!/usr/bin/env node
// Owner's scoring report. Read-only (SELECT only); prints counts only: no ids, names, emails, transcripts or times.
//
//   npm run stats:scoring                  (production: GitHub → Actions → "Deploy production" → Run workflow, stage `check`)
//
// 1. Is AI scoring working? Attempts of the last SCORING_REPORT_DAYS days (default 30) by part: scored by a real model,
//    completed without an AI score ("AI score not ready yet"), failed (with stage and code), still running.
// 2. Does the app agree with the teacher? Every teacher rating (Agree / Choose level) on part attempts, plus the anonymous
//    pairs kept after students left a class, then whole mocks. This is the Version 1 accuracy check (docs/v1-plan.md §0).
//
// The hosted database when TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are set, else the local file (DATABASE_PATH,
// default ./data/cefro.db).
import fs from "node:fs";
import { createClient } from "@libsql/client";
import { agreementSummary, mockAgreementSummary, scoringHealth } from "./lib/scoring-summary.mjs";

for (const file of [".env.local", ".env"]) if (fs.existsSync(file)) process.loadEnvFile(file);
const url = process.env.TURSO_DATABASE_URL;
const dbPath = process.env.DATABASE_PATH ?? "./data/cefro.db";
if (!url && !fs.existsSync(dbPath)) {
  console.log(`No database at ${dbPath} yet.`);
  process.exit(0);
}
const days = Math.max(1, Number.parseInt(process.env.SCORING_REPORT_DAYS ?? "30", 10) || 30);
const since = new Date(Date.now() - days * 86_400_000).toISOString();
const client = url ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN }) : createClient({ url: `file:${dbPath}` });

try {
  const attempts = await client.execute({
    sql: `SELECT t.part AS part, a.status AS status, a.failure_stage AS failureStage, a.failure_code AS failureCode,
                 (SELECT e.provider FROM evaluations e WHERE e.attempt_id = a.id ORDER BY e.created_at DESC LIMIT 1) AS provider,
                 rec.mime_type AS mimeType, rec.duration_ms AS durationMs
            FROM speaking_attempts a
            LEFT JOIN recordings rec ON rec.attempt_id = a.id
            LEFT JOIN speaking_tasks t ON t.id = a.task_id AND t.version = a.task_version
           WHERE a.created_at >= ?`,
    args: [since],
  });
  const ratings = await client.execute(`
    SELECT t.part AS part, r.app_band AS appBand, r.agrees AS agrees, r.teacher_band AS teacherBand
      FROM teacher_ratings r
      JOIN speaking_attempts a ON a.id = r.attempt_id
      LEFT JOIN speaking_tasks t ON t.id = a.task_id AND t.version = a.task_version
    UNION ALL
    SELECT p.part AS part, p.app_band AS appBand, 0 AS agrees, p.teacher_band AS teacherBand FROM rating_pairs p`);
  const mocks = await client.execute(`SELECT app_level AS appLevel, agrees AS agrees, teacher_level AS teacherLevel FROM teacher_mock_ratings`);

  console.log(`\nCEFRO scoring report (${url ? "hosted database" : dbPath})\n`);
  console.log(`1. Is AI scoring working? Attempts started in the last ${days} days:`);
  for (const l of scoringHealth(attempts.rows)) console.log(l);
  console.log(`\n2. Does the app agree with the teacher? Bands 0-5, all time:`);
  for (const l of agreementSummary(ratings.rows)) console.log(l);
  for (const l of mockAgreementSummary(mocks.rows)) console.log(l);
  console.log("");
} finally {
  client.close();
}
