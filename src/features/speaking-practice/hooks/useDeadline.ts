"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Remaining time until an absolute deadline (epoch ms).
 *
 * The deadline lives in the practice state machine; this hook only renders
 * it. Remaining time is recomputed from the clock on every tick, so timers
 * stay correct even when the browser throttles background tabs.
 * `onExpire` fires exactly once per deadline.
 */
export function useDeadline(deadline: number | null, onExpire: () => void): number {
  const [now, setNow] = useState(() => Date.now());
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  useEffect(() => {
    if (deadline === null) return;
    let fired = false;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (!fired && current >= deadline) {
        fired = true;
        onExpireRef.current();
      }
    };
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [deadline]);

  return deadline === null ? 0 : Math.max(0, deadline - now);
}
