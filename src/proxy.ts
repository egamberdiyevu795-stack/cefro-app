import { NextResponse, type NextRequest } from "next/server";
import { MOCK_HEADER, MOCK_PARAM } from "@/features/demo/demo-mode";
import {
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
export function proxy(request: NextRequest) {
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
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
