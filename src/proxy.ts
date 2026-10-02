import { NextResponse, type NextRequest } from "next/server";
import {
  USER_COOKIE_MAX_AGE_SECONDS,
  USER_COOKIE_NAME,
  isValidUserId,
} from "@/server/identity/user-cookie";

/**
 * Ensures every page visit has an anonymous user id cookie before the page's
 * client code calls the API (avoids racing API calls creating different ids).
 * API routes are excluded: they resolve the user themselves, and keeping the
 * proxy off them avoids buffering audio uploads.
 */
export function proxy(request: NextRequest) {
  const existing = request.cookies.get(USER_COOKIE_NAME)?.value;
  if (existing && isValidUserId(existing)) return NextResponse.next();

  const userId = crypto.randomUUID();
  request.cookies.set(USER_COOKIE_NAME, userId);
  const response = NextResponse.next({ request });
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
