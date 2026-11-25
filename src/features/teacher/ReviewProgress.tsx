"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

/**
 * How many of a mock's parts the teacher has rated, live: each part's "Your view" reports a save, and the summary beside
 * the parts says "2 of 4 parts rated" without a reload. Starts from the ratings the page was built with.
 */
const ReviewContext = createContext<{ rated: ReadonlySet<string>; markRated: (id: string) => void } | null>(null);

export function ReviewProvider({ initiallyRated, children }: { initiallyRated: readonly string[]; children: React.ReactNode }) {
  const [rated, setRated] = useState<ReadonlySet<string>>(() => new Set(initiallyRated));
  const markRated = useCallback((id: string) => setRated((prev) => (prev.has(id) ? prev : new Set([...prev, id]))), []);
  const value = useMemo(() => ({ rated, markRated }), [rated, markRated]);
  return <ReviewContext.Provider value={value}>{children}</ReviewContext.Provider>;
}

/** For a part's "Your view": call it with the part's id after a rating is saved. Outside a mock page: does nothing. */
export function useMarkRated(): (id: string) => void {
  return useContext(ReviewContext)?.markRated ?? noop;
}
const noop = () => {};

/** "2 of 4 parts rated", with a bar. `total`: the parts that can be rated (scored parts). */
export function ReviewProgress({ total }: { total: number }) {
  const rated = useContext(ReviewContext)?.rated.size ?? 0;
  const done = Math.min(rated, total);
  return (
    <div data-testid="review-progress">
      <p className="text-body font-medium text-fg">
        {total === 0 ? "No parts to rate yet" : done === total ? `All ${total} parts rated` : `${done} of ${total} parts rated`}
      </p>
      {total > 0 && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-well" aria-hidden="true">
          <div className="h-full rounded-full bg-accent" style={{ width: `${(done / total) * 100}%` }} />
        </div>
      )}
    </div>
  );
}
