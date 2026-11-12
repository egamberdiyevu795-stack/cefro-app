import "server-only";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/*
 * The class PIN (docs/v1-plan.md section 6): 4 digits, stored only as a salted scrypt hash on `class_members.pin_hash`. There are
 * only 10,000 PINs, so the hash is not what protects them: the online limit is (5 wrong PINs lock a student on a laptop,
 * 10 on all laptops together, `domain/teacher/exam-laptop.ts`). The hash keeps a copy of the database from reading PINs
 * at a glance. A PIN or its hash is never returned by any route, page, log line or error.
 */

const KEY_LENGTH = 32;
const COST = { N: 16384, r: 8, p: 1 } as const;

function derive(pin: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(pin, salt, KEY_LENGTH, COST, (error, key) => (error ? reject(error) : resolve(key))));
}

/** `scrypt$<salt hex>$<key hex>`. A new salt every time, so equal PINs give different hashes. */
export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${(await derive(pin, salt)).toString("hex")}`;
}

/** Constant-time check. A missing or unreadable hash never matches. */
export async function verifyPin(pin: string, stored: string | null | undefined): Promise<boolean> {
  const parts = stored?.split("$");
  if (!parts || parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1]!, "hex");
  const expected = Buffer.from(parts[2]!, "hex");
  if (salt.length !== 16 || expected.length !== KEY_LENGTH) return false;
  return timingSafeEqual(await derive(pin, salt), expected);
}
