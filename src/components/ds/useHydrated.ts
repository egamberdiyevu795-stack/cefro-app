// Client components only: import it from this file, not from the components/ds index (server pages import that).
import { useSyncExternalStore } from "react";

const subscribeNever = () => () => undefined;

/**
 * False in the server HTML and while React hydrates it; true once the page's scripts run. For client components only.
 *
 * A control that only works once React has taken over must render disabled until then. On a slow connection the HTML
 * arrives long before the scripts, and a control used in between misbehaves:
 * - a value typed or picked into a controlled input never reaches React's state (React does not read it back);
 * - a submit button sends the form the browser's way: a plain GET to the same page, which reloads it, loses what was
 *   entered, and puts the fields in the address (a password, on the sign-in form);
 * - a `type="button"` does nothing at all, and the tap is lost without a sign.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribeNever, () => true, () => false);
}
