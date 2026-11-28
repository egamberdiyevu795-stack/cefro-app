#!/usr/bin/env node
// The owner's way to set a role by hand (docs/teacher-plan.md, section 3). People take the teacher role themselves,
// at sign-up or on their Account page; this is for putting it right, or taking it back from someone who misused it.
//
//   node scripts/set-role.mjs <email> teacher     make this account a teacher
//   node scripts/set-role.mjs <email> student     take the role back
//
// The hosted database when TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are set, else the local file (DATABASE_PATH,
// default ./data/cefro.db). Only a registered account can change role. Refuses to run in a Vercel build. Needs
// migration 0006 (npm run db:migrate).
import { createClient } from "@libsql/client";

const [email, role] = process.argv.slice(2);
const die = (message) => {
  console.error(`set-role: ${message}`);
  process.exit(1);
};
if (process.env.VERCEL) die("refusing to run on Vercel. Run it by hand from your own machine.");
if (!email || !["teacher", "student"].includes(role)) die("usage: node scripts/set-role.mjs <email> teacher|student");

const url = process.env.TURSO_DATABASE_URL;
const client = url
  ? createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN })
  : createClient({ url: `file:${process.env.DATABASE_PATH ?? "./data/cefro.db"}` });
try {
  const result = await client.execute({
    sql: "UPDATE users SET role = ? WHERE email = ? AND kind = 'registered' AND merged_into_user_id IS NULL",
    args: [role, email.trim().toLowerCase()],
  });
  if (result.rowsAffected !== 1) die("no registered account with that email.");
  console.log(`set-role: ${email.trim().toLowerCase()} is now a ${role}.`);
} catch (error) {
  die(/no such column: role/.test(String(error)) ? "the database has no role column yet: run npm run db:migrate first." : "the update failed.");
} finally {
  client.close();
}
