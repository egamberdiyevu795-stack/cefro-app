#!/usr/bin/env node
// The owner's "Delete my account" for someone else (docs/consent-design.md, "Pilot route"): for when a parent or
// guardian (or an adult tester) asks the owner to delete everything, without the student's password.
//
//   node scripts/delete-account.mjs <email>          DRY RUN: shows what would be deleted, deletes nothing
//   node scripts/delete-account.mjs <email> --yes    deletes the account and everything in it, for good
//
// It removes exactly what "Delete my account" removes (src/server/account/delete-account.ts; a unit test runs both on
// the same data and fails if they ever differ, and another fails if a new table is not handled here): the account,
// its password, sign-in sessions and email tokens, the anonymous identities merged into it, every attempt with its
// recording (the audio files under AUDIO_STORAGE_DIR and the rows of recording_blobs), transcript and result, practice
// sessions, analytics events, and the Teacher view rows (class links, ratings, a teacher's classes). Shared task
// snapshots (speaking_tasks) and anonymous rating_pairs hold nothing about a person and stay.
//
// The hosted database when TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are set, else the local file (DATABASE_PATH,
// default ./data/cefro.db). Audio files: AUDIO_STORAGE_DIR (default ./data/audio). Only a registered account can be
// deleted. Refuses to run on Vercel. Prints counts only (no ids).
import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@libsql/client";

const args = process.argv.slice(2);
const die = (message) => {
  console.error(`delete-account: ${message}`);
  process.exit(1);
};
const usage = "usage: node scripts/delete-account.mjs <email> [--yes]";
if (process.env.VERCEL) die("refusing to run on Vercel. Run it by hand from your own machine.");
const positional = args.filter((a) => !a.startsWith("--"));
const flags = args.filter((a) => a.startsWith("--"));
if (positional.length !== 1 || flags.some((f) => f !== "--yes")) die(usage);
const confirmed = flags.includes("--yes");
const address = positional[0].trim().toLowerCase();

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${process.env.DATABASE_PATH ?? "./data/cefro.db"}` });
const audioDir = path.resolve(process.env.AUDIO_STORAGE_DIR ?? "./data/audio");

const rows = async (sql, params = []) => (await client.execute({ sql, args: params })).rows;
const marks = (list) => list.map(() => "?").join(", ");

try {
  const [account] = await rows("SELECT id, email FROM users WHERE email = ? AND kind = 'registered' AND merged_into_user_id IS NULL", [address]);
  if (!account) die("no registered account with that email.");

  // The account and every identity merged into it (directly or through another).
  const userIds = [String(account.id)];
  for (let i = 0; i < userIds.length; i++) {
    for (const r of await rows("SELECT id FROM users WHERE merged_into_user_id = ?", [userIds[i]])) {
      if (!userIds.includes(String(r.id))) userIds.push(String(r.id));
    }
  }
  const attemptIds = (await rows(`SELECT id FROM speaking_attempts WHERE user_id IN (${marks(userIds)})`, userIds)).map((r) => String(r.id));
  const stored = attemptIds.length
    ? (await rows(`SELECT storage_provider AS provider, storage_key AS key FROM recordings WHERE attempt_id IN (${marks(attemptIds)})`, attemptIds)).map(
        (r) => ({ provider: String(r.provider), key: String(r.key) }),
      )
    : [];
  const unknown = stored.find((r) => r.provider !== "local" && r.provider !== "database");
  if (unknown) die(`audio stored with provider "${unknown.provider.slice(0, 40)}" can't be deleted by this script; nothing was deleted.`);
  const ownClassIds = (await rows(`SELECT id FROM classes WHERE teacher_user_id IN (${marks(userIds)})`, userIds)).map((r) => String(r.id));
  const localKeys = stored.filter((r) => r.provider === "local").map((r) => r.key);
  const blobKeys = stored.filter((r) => r.provider === "database").map((r) => r.key);

  const summary = `${attemptIds.length} attempt(s), ${stored.length} recording(s) (${localKeys.length} file(s), ${blobKeys.length} in the database), ${ownClassIds.length} class(es) taught`;
  if (!confirmed) {
    console.log(`delete-account: DRY RUN for ${address}: would delete the account and ${summary}. Nothing was deleted. Add --yes to delete.`);
    process.exit(0);
  }

  // 1. Audio files on disk first (a missing file is not an error), as "Delete my account" does.
  for (const key of localKeys) {
    if (!/^[a-zA-Z0-9/_.-]+$/.test(key) || key.includes("..")) die("a recording has an invalid storage key; nothing more was deleted.");
    await fs.rm(path.join(audioDir, key), { force: true });
  }

  // 2. Everything else in one transaction, children before parents (foreign keys are enforced).
  const u = marks(userIds);
  const statements = [];
  const add = (sql, params) => statements.push({ sql, args: params });
  if (blobKeys.length) add(`DELETE FROM recording_blobs WHERE storage_key IN (${marks(blobKeys)})`, blobKeys);
  add(`DELETE FROM teacher_ratings WHERE teacher_user_id IN (${u})`, userIds);
  if (ownClassIds.length) add(`DELETE FROM teacher_ratings WHERE class_id IN (${marks(ownClassIds)})`, ownClassIds);
  if (attemptIds.length) add(`DELETE FROM teacher_ratings WHERE attempt_id IN (${marks(attemptIds)})`, attemptIds);
  // Whole-mock levels (migration 0009), before the sessions and classes they point at.
  add(`DELETE FROM teacher_mock_ratings WHERE teacher_user_id IN (${u})`, userIds);
  if (ownClassIds.length) add(`DELETE FROM teacher_mock_ratings WHERE class_id IN (${marks(ownClassIds)})`, ownClassIds);
  add(`DELETE FROM teacher_mock_ratings WHERE session_id IN (SELECT id FROM practice_sessions WHERE user_id IN (${u}))`, userIds);
  add(`DELETE FROM class_members WHERE student_user_id IN (${u})`, userIds);
  if (ownClassIds.length) add(`DELETE FROM class_members WHERE class_id IN (${marks(ownClassIds)})`, ownClassIds);
  if (ownClassIds.length) add(`DELETE FROM classes WHERE id IN (${marks(ownClassIds)})`, ownClassIds);
  if (attemptIds.length) {
    const a = marks(attemptIds);
    add(`DELETE FROM evaluations WHERE attempt_id IN (${a})`, attemptIds);
    add(`DELETE FROM transcripts WHERE attempt_id IN (${a})`, attemptIds);
    add(`DELETE FROM recordings WHERE attempt_id IN (${a})`, attemptIds);
    add(`DELETE FROM analytics_events WHERE attempt_id IN (${a})`, attemptIds);
    add(`DELETE FROM speaking_attempts WHERE id IN (${a})`, attemptIds);
  }
  add(`DELETE FROM practice_sessions WHERE user_id IN (${u})`, userIds);
  add(`DELETE FROM analytics_events WHERE user_id IN (${u})`, userIds);
  add(`DELETE FROM auth_sessions WHERE user_id IN (${u})`, userIds);
  add(`DELETE FROM auth_accounts WHERE user_id IN (${u})`, userIds);
  add("DELETE FROM auth_verifications WHERE identifier = ?", [String(account.email)]);
  add(`UPDATE users SET merged_into_user_id = NULL WHERE id IN (${u}) OR merged_into_user_id IN (${u})`, [...userIds, ...userIds]);
  add(`DELETE FROM users WHERE id IN (${u})`, userIds);
  await client.batch(statements, "write");

  console.log(`delete-account: ${address}: deleted the account and ${summary}.`);
} catch (error) {
  die(`the deletion failed; the database was not changed (audio files may already be gone). ${String(error?.code ?? "")}`.trim());
} finally {
  client.close();
}
