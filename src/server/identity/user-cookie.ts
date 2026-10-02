// Shared by the proxy (no server-only imports allowed there) and the server.
export const USER_COOKIE_NAME = "cefro_uid";
export const USER_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUserId(value: string): boolean {
  return UUID_PATTERN.test(value);
}
