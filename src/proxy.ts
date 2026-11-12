import { NextResponse, type NextRequest } from "next/server";
import { MOCK_HEADER, MOCK_PARAM } from "@/features/demo/demo-mode";
import {
  EXAM_DEVICE_COOKIE,
  USER_COOKIE_MAX_AGE_SECONDS,
  USER_COOKIE_NAME,
  hasSessionCookie,
  isValidUserId,
} from "@/server/identity/user-cookie";

/**
 * Ensures every page visit has an anonymous user id cookie before the page's
 * client code calls the API (avoids racing API calls creating different ids).
 * API routes are excluded: they resolve the user themselves, and keeping the
 * proxy off them avoids buffering audio uploads.
 *
 * Also tells the page whether it is in mock mode (`?mock=1`), as the request header `x-cefro-mock: 1`: a layout gets
 * no query, so the (entry) layout reads this to skip the configuration check. The header is
 * set only from the address; one sent by the browser is removed.
 */
/**
 * A browser that carries the exam laptop's DEVICE SESSION cookie (docs/teacher-plan.md, section 11) may reach only the exam laptop's
 * own screen (T7) and the public files that screen plays (spoken introductions, task pictures). Every other page answers the
 * not-found page and every other API (the matcher only sends the APIs that are not the exam laptop's own through here) answers the
 * same JSON 404 as a stranger: teacher pages, student pages, the Account page, recordings, results. The cookie's own validity is
 * checked by the routes; this gate needs only that it is there.
 */
export const EXAM_LAPTOP_PAGE = /^\/teacher\/classes\/[^/]+\/exam\/[^/]+\/laptop\/?$/;
const PUBLIC_FILES = /^\/(audio|tasks)\/|^\/[^/]+\.[a-z0-9]+$/i;
/** The only APIs a device session uses: its own routes, the mock's start and finish (with a pass) and the recording upload (with a pass). */
const EXAM_LAPTOP_API = /^\/api\/(exam-laptop\/|mock-exams\/?$|mock-exams\/[^/]+\/finish\/?$|speaking\/attempts\/?$)/;
export function examDeviceAllows(pathname: string): boolean {
  return EXAM_LAPTOP_PAGE.test(pathname) || PUBLIC_FILES.test(pathname) || EXAM_LAPTOP_API.test(pathname);
}

export function proxy(request: NextRequest) {
  if (request.cookies.get(EXAM_DEVICE_COOKIE) && !examDeviceAllows(request.nextUrl.pathname)) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: { code: "not_found", message: "Not found." } }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    // A path no page answers: the standard not-found page, with its 404 status.
    return NextResponse.rewrite(new URL("/exam-laptop-refused", request.url), { status: 404 });
  }
  const headers = new Headers(request.headers);
  headers.delete(MOCK_HEADER);
  if (request.nextUrl.searchParams.get(MOCK_PARAM) === "1") headers.set(MOCK_HEADER, "1");

  // A signed-in browser does not need an anonymous identity. (Presence only: the session itself is verified by the server.)
  const existing = request.cookies.get(USER_COOKIE_NAME)?.value;
  if (hasSessionCookie(request.cookies) || (existing && isValidUserId(existing))) {
    return NextResponse.next({ request: { headers } });
  }

  const userId = crypto.randomUUID();
  request.cookies.set(USER_COOKIE_NAME, userId);
  headers.set("cookie", request.headers.get("cookie") ?? "");
  const response = NextResponse.next({ request: { headers } });
  response.cookies.set(USER_COOKIE_NAME, userId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: USER_COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
    // The APIs a device session may NOT use (everything but the exam laptop's own routes, the mock's start and finish and the
    // recording upload), only for a browser that carries the device cookie. The excluded routes never pass through here, so
    // audio uploads are not buffered.
    { source: "/api/((?!exam-laptop/|mock-exams$|mock-exams/[^/]+/finish$|speaking/attempts$).*)", has: [{ type: "cookie", key: EXAM_DEVICE_COOKIE }] },
  ],
};
