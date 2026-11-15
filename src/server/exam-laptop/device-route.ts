import "server-only";
import { headers } from "next/headers";
import { errorResponse, isCrossSite, withErrorHandling } from "@/server/http";
import { teacherLive } from "@/server/teacher/release";
import { clearDeviceCookieLine, hasDeviceCookie, readDeviceSession, type DeviceSession } from "./device-session";

const NOT_FOUND = () => errorResponse(404, "not_found", "Not found.");

/**
 * A route of the exam laptop's own API (`/api/exam-laptop/[mockId]/…`). It accepts ONLY a device session scoped to the class
 * mock in the address: a teacher's login session, a student, a stranger or another class mock's laptop all get the same 404
 * as a route that does not exist. A device cookie that no longer holds (the class mock closed, the teacher is gone) is removed in the
 * answer, so the browser is an ordinary one again. Off while the Teacher view is off.
 */
export function deviceRoute<Ctx extends { params: Promise<{ mockId: string }> }>(handler: (request: Request, ctx: Ctx, device: DeviceSession) => Promise<Response>) {
  const handle = withErrorHandling(async (request: Request, ctx: Ctx) => {
    if (request.method !== "GET" && isCrossSite(request)) return errorResponse(403, "cross_site_request", "This request was not made from CEFRO.");
    const cookie = (await headers()).get("cookie");
    const device = await readDeviceSession(cookie);
    if (!device) {
      const refused = NOT_FOUND();
      if (hasDeviceCookie(cookie)) refused.headers.append("set-cookie", clearDeviceCookieLine());
      return refused;
    }
    if ((await ctx.params).mockId !== device.classMockId) return NOT_FOUND();
    return handler(request, ctx, device);
  });
  return (request: Request, ctx: Ctx) => (teacherLive() ? handle(request, ctx) : Promise.resolve(NOT_FOUND()));
}

