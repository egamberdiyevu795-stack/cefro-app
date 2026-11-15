"use client";

import { useState, type FormEvent } from "react";
import { Notice, PillAction, PillButton, TextField } from "@/components/ds";
import { useHydrated } from "@/components/ds/useHydrated";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/domain/account";
import { FORGOT, RESET } from "@/features/entry/content";

/**
 * The two "Forgot password" forms (docs/password-reset.md). Like AuthForm: built only from design-system components,
 * the one black button is disabled until the page is ready (`useHydrated`, so a tap before the scripts ran never sends
 * the form the browser's way), `method="post"` as the second layer, and mock mode (`?mock=1`) never calls an API.
 */

type ErrorBody = { error?: { code?: string; message?: string } } | null;

const OFFLINE = "We couldn't reach CEFRO. Check your internet connection and try again.";
const DEMO = "Demo mode: nothing was sent and no account was used.";

/** Step 1: the email. Afterwards the same words whether or not the address has an account. */
export function ForgotPasswordForm({ mock = false }: { mock?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const ready = useHydrated();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (mock) {
      setSent(true);
      return;
    }
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    if (!email) {
      setError("Enter the email you signed up with.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/account/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ErrorBody;
        setError(body?.error?.message ?? "Something went wrong. Please try again.");
        return;
      }
      setSent(true);
    } catch {
      setError(OFFLINE);
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <Notice>{FORGOT.sent}</Notice>
        {mock && <Notice>{DEMO}</Notice>}
      </div>
    );
  }
  return (
    <form method="post" onSubmit={submit} className="space-y-4" noValidate>
      <TextField id="email" name="email" label="Email" type="email" autoComplete="email" required />
      {error && <Notice tone="alert">{error}</Notice>}
      <PillAction type="submit" size="lg" disabled={busy || !ready} className="w-full">
        {busy ? "One moment…" : FORGOT.submit}
      </PillAction>
    </form>
  );
}

/** Step 2: the new password, with the token from the email's link. Done: the black button becomes "Sign in". */
export function ResetPasswordForm({ token, mock = false, signInHref, forgotHref }: { token: string; mock?: boolean; signInHref: string; forgotHref: string }) {
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<"form" | "done" | "expired">(token || mock ? "form" : "expired");
  const [busy, setBusy] = useState(false);
  const ready = useHydrated();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const newPassword = String(new FormData(event.currentTarget).get("password") ?? "");
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      setError(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (mock) {
      setState("done");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/account/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ token, newPassword }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ErrorBody;
        if (body?.error?.code === "invalid_token") setState("expired");
        else setError(body?.error?.message ?? "Something went wrong. Please try again.");
        return;
      }
      setState("done");
    } catch {
      setError(OFFLINE);
    } finally {
      setBusy(false);
    }
  }

  if (state === "done") {
    return (
      <div className="space-y-4">
        <Notice>{RESET.done}</Notice>
        {mock && <Notice>{DEMO}</Notice>}
        <PillButton href={signInHref} size="lg" className="w-full">
          {RESET.signIn}
        </PillButton>
      </div>
    );
  }
  if (state === "expired") {
    return (
      <div className="space-y-4">
        <Notice tone="alert">{RESET.expired}</Notice>
        <PillButton href={forgotHref} size="lg" className="w-full">
          {RESET.askAgain}
        </PillButton>
      </div>
    );
  }
  return (
    <form method="post" onSubmit={submit} className="space-y-4" noValidate>
      <TextField
        id="password"
        name="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN_LENGTH}
        maxLength={PASSWORD_MAX_LENGTH}
        hint="At least 8 characters."
      />
      {error && <Notice tone="alert">{error}</Notice>}
      <PillAction type="submit" size="lg" disabled={busy || !ready} className="w-full">
        {busy ? "One moment…" : RESET.submit}
      </PillAction>
    </form>
  );
}
