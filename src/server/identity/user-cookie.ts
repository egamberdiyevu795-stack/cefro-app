// Shared by the proxy (no server-only imports allowed there) and the server.
export const USER_COOKIE_NAME = "cefro_uid";
export const USER_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUserId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Login-session cookie names (the auth library prefixes them: `cefro.session_token`, and `__Secure-` over HTTPS).
 * Shared with the proxy, which only needs to know whether a login session cookie is PRESENT, never what it holds.
 */
export const AUTH_COOKIE_PREFIX = "cefro";
export const SESSION_COOKIE_NAMES = [`${AUTH_COOKIE_PREFIX}.session_token`, `__Secure-${AUTH_COOKIE_PREFIX}.session_token`] as const;

export function hasSessionCookie(cookies: { get(name: string): unknown }): boolean {
  return SESSION_COOKIE_NAMES.some((name) => Boolean(cookies.get(name)));
}
