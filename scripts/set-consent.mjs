#!/usr/bin/env node
// The ONLY way to record pilot consent (docs/consent-design.md, "Pilot route"): the owner runs this by hand, after
// keeping the parent's (or the adult tester's) written "yes". No API and no page can set consent.
//
//   node scripts/set-consent.mjs <email> granted                    unlock recording
//   node scripts/set-consent.mjs <email> granted --teacher-sharing  unlock recording and sharing with a teacher
//   node scripts/set-consent.mjs <email> withdrawn                  lock recording (and teacher sharing) again
//
// Each run sets the whole consent: `granted` without --teacher-sharing turns teacher sharing off. `withdrawn` keeps the
// account and its data; to delete them too, the student uses "Delete my account" (or the owner deletes the account).
// The lock only applies while CONSENT_REQUIRED=true (docs/launch-checklist.md).
//
// The hosted database when TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are set, else the local file (DATABASE_PATH,
// default ./data/cefro.db). Only a registered account can be changed. Refuses to run on Vercel. Needs migration 0007
// (npm run db:migrate).
import { createClient } from "@libsql/client";

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith("--"));
const [email, status] = args.filter((a) => !a.startsWith("--"));
const die = (message) => {
  console.error(`set-consent: ${message}`);
  process.exit(1);
};
const usage = "usage: node scripts/set-consent.mjs <email> granted|withdrawn [--teacher-sharing]";
if (process.env.VERCEL) die("refusing to run on Vercel. Run it by hand from your own machine.");
if (!email || !["granted", "withdrawn"].includes(status) || args.length > 3) die(usage);
const unknown = flags.find((f) => f !== "--teacher-sharing");
if (unknown) die(`unknown option ${unknown.slice(0, 40)}. ${usage}`);
const teacherSharing = flags.includes("--teacher-sharing");
if (teacherSharing && status !== "granted") die("--teacher-sharing goes with granted only.");

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${process.env.DATABASE_PATH ?? "./data/cefro.db"}` });
const address = email.trim().toLowerCase();
try {
  const result = await client.execute({
    sql:
      "UPDATE users SET consent_status = ?, consent_at = ?, consent_teacher_sharing = ? " +
      "WHERE email = ? AND kind = 'registered' AND merged_into_user_id IS NULL",
    args: [status, new Date().toISOString(), teacherSharing ? 1 : 0, address],
  });
  if (result.rowsAffected !== 1) die("no registered account with that email.");
  console.log(
    status === "granted"
      ? `set-consent: ${address}: consent granted, recording unlocked; teacher sharing ${teacherSharing ? "on" : "off"}.`
      : `set-consent: ${address}: consent withdrawn, recording and teacher sharing locked. The account and its data are kept.`,
  );
} catch (error) {
  die(/no such column: consent_/.test(String(error)) ? "the database has no consent columns yet: run npm run db:migrate first." : "the update failed.");
} finally {
  client.close();
}
