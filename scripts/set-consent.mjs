#!/usr/bin/env node
// The ONLY way to record pilot consent (docs/consent-design.md, "Pilot route"): the owner runs this by hand, after
// keeping the parent's (or the adult tester's) written "yes". No API and no page can set consent.
//
//   node scripts/set-consent.mjs <email> granted                    unlock recording
//   node scripts/set-consent.mjs <email> granted --teacher-sharing  unlock recording and sharing with a teacher
//   node scripts/set-consent.mjs <email> withdrawn                  lock recording (and teacher sharing) again
//   ... granted --notice <version>   the text the person agreed to (default: the current pilot parent message)
//
// Each run sets the whole consent: `granted` without --teacher-sharing turns teacher sharing off. `withdrawn` keeps the
// account and its data; to delete them too, the student uses "Delete my account" (or the owner deletes the account).
// The lock only applies while CONSENT_REQUIRED=true (docs/launch-checklist.md).
//
// The hosted database when TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are set, else the local file (DATABASE_PATH,
// default ./data/cefro.db). Only a registered account can be changed. `granted` stores which text was agreed to
// (`consent_notice_version`); `withdrawn` keeps the version that was agreed, as a record. Refuses to run on Vercel. Needs migration 0007
// (npm run db:migrate).
import { createClient } from "@libsql/client";

/** The version of docs/pilot-parent-message.md. Change it (and the doc's header) whenever that text changes. */
const CURRENT_NOTICE = "pilot-parent-message-2026-11-12";

const raw = process.argv.slice(2);
let notice = CURRENT_NOTICE;
const noticeAt = raw.indexOf("--notice");
if (noticeAt !== -1) {
  notice = raw[noticeAt + 1] ?? "";
  raw.splice(noticeAt, 2);
}
const args = raw;
const flags = args.filter((a) => a.startsWith("--"));
const [email, status] = args.filter((a) => !a.startsWith("--"));
const die = (message) => {
  console.error(`set-consent: ${message}`);
  process.exit(1);
};
const usage = "usage: node scripts/set-consent.mjs <email> granted|withdrawn [--teacher-sharing] [--notice <version>]";
if (process.env.VERCEL) die("refusing to run on Vercel. Run it by hand from your own machine.");
if (!email || !["granted", "withdrawn"].includes(status) || args.length > 3) die(usage);
const unknown = flags.find((f) => f !== "--teacher-sharing");
if (unknown) die(`unknown option ${unknown.slice(0, 40)}. ${usage}`);
const teacherSharing = flags.includes("--teacher-sharing");
if (teacherSharing && status !== "granted") die("--teacher-sharing goes with granted only.");
if (noticeAt !== -1 && status !== "granted") die("--notice goes with granted only.");
if (!/^[a-z0-9][a-z0-9.-]{2,79}$/.test(notice)) die("--notice needs a version like pilot-parent-message-2026-11-12.");

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${process.env.DATABASE_PATH ?? "./data/cefro.db"}` });
const address = email.trim().toLowerCase();
try {
  const result = await client.execute({
    sql:
      status === "granted"
        ? "UPDATE users SET consent_status = ?, consent_at = ?, consent_teacher_sharing = ?, consent_notice_version = ? " +
          "WHERE email = ? AND kind = 'registered' AND merged_into_user_id IS NULL"
        : "UPDATE users SET consent_status = ?, consent_at = ?, consent_teacher_sharing = ? " +
          "WHERE email = ? AND kind = 'registered' AND merged_into_user_id IS NULL",
    args:
      status === "granted"
        ? [status, new Date().toISOString(), teacherSharing ? 1 : 0, notice, address]
        : [status, new Date().toISOString(), 0, address],
  });
  if (result.rowsAffected !== 1) die("no registered account with that email.");
  console.log(
    status === "granted"
      ? `set-consent: ${address}: consent granted (${notice}), recording unlocked; teacher sharing ${teacherSharing ? "on" : "off"}.`
      : `set-consent: ${address}: consent withdrawn, recording and teacher sharing locked. The account and its data are kept; to delete them: node scripts/delete-account.mjs ${address}`,
  );
} catch (error) {
  die(/no such column: consent_/.test(String(error)) ? "the database has no consent columns yet: run npm run db:migrate first." : "the update failed.");
} finally {
  client.close();
}
