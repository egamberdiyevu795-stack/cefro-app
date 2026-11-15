import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { isLaptopId, normaliseRoomLabel } from "@/domain/teacher/exam-laptop";
import { INSECURE_DEV_AUTH_SECRET } from "@/server/auth/secret";
import { getEnv } from "@/server/config/env";
import { getDb } from "@/server/db/client";
import { classMocks, classes, users } from "@/server/db/schema";
import { EXAM_DEVICE_COOKIE } from "@/server/identity/user-cookie";

/*
 * The exam laptop's DEVICE SESSION. When "Start exam laptop" (or joining as Room 2) succeeds, the teacher's login session on
 * that browser is signed out and this cookie takes its place. It is scoped to ONE class mock and ONE laptop and lets the browser
 * do exactly four things: show the T7 list, take PINs, create one-mock passes, and run the three mock routes a pass allows.
 * Every other page and API (teacher, student, Account) refuses it, because the browser has no login session at all and the
 * proxy answers 404 for everything but the exam laptop's own address (src/proxy.ts). Getting a teacher session back needs the
 * teacher's email and password (End exam laptop, Unlock).
 *
 * The cookie is signed (HMAC-SHA256 with the auth secret, a separate label), carries no login credential, is a SESSION cookie
 * (gone when the browser closes), and is checked against the database on every request: the class mock must still be open and
 * the teacher still a teacher. Closing the class mock ends the device session.
 */

export interface DeviceSession {
  teacherId: string;
  classId: string;
  classMockId: string;
  /** The laptop's own random id: where PIN counts and passes are scoped. */
  laptopId: string;
  /** "Room 2". */
  room: string;
}

/** A device session lasts at most this long even if nobody ends it. */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

function key(): Buffer {
  const env = getEnv();
  return Buffer.from(`exam-device|${env.AUTH_SECRET ?? INSECURE_DEV_AUTH_SECRET}`);
}
const sign = (body: string) => createHmac("sha256", key()).update(body).digest("base64url");

/** The cookie value for a new device session. */
export function signDeviceSession(device: DeviceSession, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ t: device.teacherId, c: device.classId, m: device.classMockId, l: device.laptopId, r: device.room, e: now + MAX_AGE_MS })).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** The cookie's contents when the signature and expiry hold, else null. Says nothing about the database. */
export function parseDeviceCookie(value: string | null | undefined, now = Date.now()): DeviceSession | null {
  const [body, mac, extra] = (value ?? "").split(".");
  if (!body || !mac || extra !== undefined) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, unknown>;
    const room = normaliseRoomLabel(p.r);
    if (typeof p.t !== "string" || typeof p.c !== "string" || typeof p.m !== "string" || typeof p.e !== "number" || p.e <= now || !room || !isLaptopId(p.l)) return null;
    return { teacherId: p.t, classId: p.c, classMockId: p.m, laptopId: p.l, room };
  } catch {
    return null;
  }
}

export function cookieValueOf(cookieHeader: string | null | undefined, name: string): string | null {
  for (const part of (cookieHeader ?? "").split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

/** Is a device cookie present at all (valid or not)? Used to clear a dead one. */
export const hasDeviceCookie = (cookieHeader: string | null | undefined) => cookieValueOf(cookieHeader, EXAM_DEVICE_COOKIE) !== null;

/**
 * The device session a request carries, checked against the database: its class mock exists in its class, is open (unless
 * `allowClosed`: a student already under way may finish), the class is open and the teacher is still a teacher. Null otherwise.
 */
export async function readDeviceSession(cookieHeader: string | null | undefined, options: { allowClosed?: boolean } = {}, now = Date.now()): Promise<DeviceSession | null> {
  const device = parseDeviceCookie(cookieValueOf(cookieHeader, EXAM_DEVICE_COOKIE), now);
  if (!device) return null;
  const db = await getDb();
  const cm = await db.select().from(classMocks).where(and(eq(classMocks.id, device.classMockId), eq(classMocks.classId, device.classId), eq(classMocks.teacherUserId, device.teacherId))).get();
  if (!cm || (cm.closedAt && !options.allowClosed)) return null;
  const cls = await db.select({ closedAt: classes.closedAt }).from(classes).where(eq(classes.id, device.classId)).get();
  if (!cls || cls.closedAt) return null;
  const teacher = await db.select({ role: users.role, kind: users.kind }).from(users).where(eq(users.id, device.teacherId)).get();
  if (!teacher || teacher.kind !== "registered" || teacher.role !== "teacher") return null;
  return device;
}

const ATTRIBUTES = `Path=/; HttpOnly; SameSite=Strict${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
/** `Set-Cookie` lines: the session cookie for a new device session, and the line that removes it. */
export const deviceCookieLine = (value: string) => `${EXAM_DEVICE_COOKIE}=${value}; ${ATTRIBUTES}`;
export const clearDeviceCookieLine = () => `${EXAM_DEVICE_COOKIE}=; ${ATTRIBUTES}; Max-Age=0`;
