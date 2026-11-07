/** Where "Delete my account" lands, and what it says there. Pure and browser-safe. */

export const ACCOUNT_DELETED = "Your account and all your data were deleted.";
/** The home page (task list), with the message. The account and its sign-in cookies are already gone by then. */
export const ACCOUNT_DELETED_HREF = "/?deleted=1";

export function isAccountDeletedQuery(query: Record<string, string | string[] | undefined>): boolean {
  const value = query.deleted;
  return (Array.isArray(value) ? value[0] : value) === "1";
}
