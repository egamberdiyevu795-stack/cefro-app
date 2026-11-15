#!/usr/bin/env node
// "Was this feedback helpful?" answers (result page), for the owner. Read-only: prints counts only (no ids, no names).
//
//   npm run stats:feedback
//
// The hosted database when TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are set, else the local file (DATABASE_PATH,
// default ./data/cefro.db). Counts scored attempts only (status completed): Yes, No, not answered, and the share of
// Yes among the answers, overall, per part, and per scorer (the development "mock" scorer is listed apart, so test
// runs never mix with real scoring).
import fs from "node:fs";
import { createClient } from "@libsql/client";
import { feedbackSummary } from "./lib/feedback-summary.mjs";

for (const file of [".env.local", ".env"]) if (fs.existsSync(file)) process.loadEnvFile(file);
const url = process.env.TURSO_DATABASE_URL;
const dbPath = process.env.DATABASE_PATH ?? "./data/cefro.db";
if (!url && !fs.existsSync(dbPath)) {
  console.log(`No database at ${dbPath} yet.`);
  process.exit(0);
}
const client = url ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN }) : createClient({ url: `file:${dbPath}` });

try {
  // The latest evaluation's provider per attempt (an attempt scored again keeps only its newest result on screen).
  const { rows } = await client.execute(`
    SELECT t.part AS part, a.feedback_helpful AS helpful,
           (SELECT e.provider FROM evaluations e WHERE e.attempt_id = a.id ORDER BY e.created_at DESC LIMIT 1) AS provider
      FROM speaking_attempts a
      LEFT JOIN speaking_tasks t ON t.id = a.task_id AND t.version = a.task_version
     WHERE a.status = 'completed'`);
  console.log(`\n"Was this feedback helpful?" (${url ? "hosted database" : dbPath})\n`);
  for (const line of feedbackSummary(rows)) console.log(line);
  console.log("");
} finally {
  client.close();
}
