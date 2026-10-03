import "server-only";
import { getCurrentUserId } from "./current-user";

/**
 * Resolve the current caller's canonical user id for an API request: the signed-in account if there is a valid
 * login session, otherwise the browser's anonymous identity (created on first use). Kept under its original name so
 * existing callers need no change; all logic lives in current-user.ts.
 */
export async function getOrCreateCurrentUserId(): Promise<string> {
  return getCurrentUserId();
}
