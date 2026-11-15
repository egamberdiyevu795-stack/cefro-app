"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useHydrated } from "@/components/ds/useHydrated";
import { QUIET_BUTTON } from "@/features/account/fields";

export const DEMO_SIGN_OUT = "Demo mode. Sign-in is off, so there is nothing to sign out of.";

/**
 * Sign out: the real sign-out endpoint (the server deletes the session), then the sign-in page (refreshed, so every part
 * of the app sees it). `demo`: nothing is sent; a note says sign-in is off.
 */
export function SignOut({ demo = false }: { demo?: boolean }) {
  const router = useRouter();
  const ready = useHydrated();
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signOut() {
    if (demo) return setNote(DEMO_SIGN_OUT);
    setBusy(true);
    const response = await fetch("/api/auth/sign-out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      credentials: "same-origin",
    }).catch(() => null);
    if (!response?.ok) {
      setBusy(false);
      return setNote("We couldn't sign you out. Check your connection and try again.");
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <button type="button" disabled={!ready || busy} onClick={() => void signOut()} className={QUIET_BUTTON}>
          Sign out
        </button>
      </div>
      {note && (
        <p role="status" className="text-label text-fg">
          {note}
        </p>
      )}
    </div>
  );
}
