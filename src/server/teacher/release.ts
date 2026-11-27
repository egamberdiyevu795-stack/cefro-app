import "server-only";
import { TEACHER_LIVE } from "@/config/features";

let override: boolean | undefined;

/** Is the real Teacher view on? On by default (`TEACHER_LIVE`); tests turn it off to check that it closes properly. */
export function teacherLive(): boolean {
  return override ?? TEACHER_LIVE;
}

/** Test seam: turn the real Teacher view on or off (undefined: back to `TEACHER_LIVE`). Never called by app code. */
export function setTeacherLiveForTesting(value: boolean | undefined): void {
  override = value;
}
