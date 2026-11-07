import "server-only";
import { TEACHER_LIVE } from "@/config/features";

let override: boolean | undefined;

/** Is the real Teacher view on? Off (`TEACHER_LIVE`) until parent consent exists; tests turn it on to check the server side. */
export function teacherLive(): boolean {
  return override ?? TEACHER_LIVE;
}

/** Test seam: turn the real Teacher view on or off (undefined: back to `TEACHER_LIVE`). Never called by app code. */
export function setTeacherLiveForTesting(value: boolean | undefined): void {
  override = value;
}
