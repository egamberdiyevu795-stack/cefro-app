import "server-only";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { assertServerConfigured } from "@/server/config/boot-check";
import { getDb } from "@/server/db/client";
import { classMocks, classes } from "@/server/db/schema";
import { teacherLive } from "@/server/teacher/release";
import { readDeviceSession, type DeviceSession } from "./device-session";
import { EXAM_DEVICE_COOKIE } from "@/server/identity/user-cookie";

/**
 * The exam laptop's own page (T7), for a REAL class: only a valid device session for exactly this class and class mock gets in;
 * a teacher's login session, a student, a stranger or another class mock's laptop all get the not-found page (a 404), as does a
 * closed class mock or a Teacher view that is off.
 */
export async function examDevicePage(classId: string, classMockId: string): Promise<{ device: DeviceSession; className: string; title: string }> {
  if (!teacherLive()) notFound();
  assertServerConfigured();
  const value = (await cookies()).get(EXAM_DEVICE_COOKIE)?.value;
  const device = value ? await readDeviceSession(`${EXAM_DEVICE_COOKIE}=${value}`) : null;
  if (!device || device.classId !== classId || device.classMockId !== classMockId) notFound();
  const db = await getDb();
  const cls = await db.select({ name: classes.name }).from(classes).where(eq(classes.id, classId)).get();
  const cm = await db.select({ title: classMocks.title }).from(classMocks).where(eq(classMocks.id, classMockId)).get();
  if (!cls || !cm) notFound();
  return { device, className: cls.name, title: cm.title };
}
