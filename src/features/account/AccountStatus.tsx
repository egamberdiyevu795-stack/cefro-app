"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type State = { state: "loading" } | { state: "anonymous" } | { state: "authenticated"; email: string };

/**
 * Header indicator: practising anonymously, or signed in (with a sign-out button). Fetched from the server so the
 * (static) pages stay cacheable and the server alone decides what "signed in" means.
 */
export function AccountStatus() {
  const [status, setStatus] = useState<State>({ state: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/me", { credentials: "same-origin", cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { state: "anonymous" }))
      .then((body) => !cancelled && setStatus(body.state === "authenticated" ? { state: "authenticated", email: body.email } : { state: "anonymous" }))
      .catch(() => !cancelled && setStatus({ state: "anonymous" }));
    return () => {
      cancelled = true;
    };
  }, []);

  async function signOut() {
    await fetch("/api/auth/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", credentials: "same-origin" }).catch(() => undefined);
    window.location.reload();
  }

  if (status.state === "loading") return <div className="ml-auto h-5 w-32" aria-hidden />;
  if (status.state === "authenticated") {
    return (
      <div className="ml-auto flex items-center gap-3 text-sm" data-testid="account-status" data-state="authenticated">
        <span className="hidden max-w-48 truncate text-muted sm:inline" title={status.email}>
          {status.email}
        </span>
        <button type="button" onClick={signOut} className="font-medium text-brand hover:text-brand-strong focus-visible:outline-2 focus-visible:outline-brand">
          Sign out
        </button>
      </div>
    );
  }
  return (
    <div className="ml-auto flex items-center gap-3 text-sm" data-testid="account-status" data-state="anonymous">
      <span className="hidden text-muted sm:inline">Practising without an account</span>
      <Link href="/login" className="font-medium text-brand hover:text-brand-strong focus-visible:outline-2 focus-visible:outline-brand">
        Sign in
      </Link>
      <Link href="/register" className="font-medium text-brand hover:text-brand-strong focus-visible:outline-2 focus-visible:outline-brand">
        Create account
      </Link>
    </div>
  );
}
