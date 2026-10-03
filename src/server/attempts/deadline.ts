import "server-only";
import { ProviderError } from "@/server/errors";

/**
 * Bound a provider call by the processing run's overall deadline.
 *
 * This stops WAITING; it cannot cancel the underlying request (the provider interfaces take no abort
 * signal), so a request that outlives the deadline may still finish in the background and be billed.
 * That is accepted: the run ends in a stored, restartable `provider_timeout` instead of hanging until
 * the platform kills the request or the attempt is declared stalled.
 */
export async function withDeadline<T>(work: Promise<T>, deadlineAt: number, what: string): Promise<T> {
  const remainingMs = deadlineAt - Date.now();
  if (remainingMs <= 0) {
    work.catch(() => undefined);
    throw new ProviderError("provider_timeout", `Processing budget exhausted before ${what}`);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new ProviderError("provider_timeout", `Processing budget exhausted during ${what}`)),
      remainingMs,
    );
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
    work.catch(() => undefined); // a late rejection after the race is settled must not be unhandled
  }
}
