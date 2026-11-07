"use client";

import { useState, type FormEvent } from "react";
import { useHydrated } from "@/components/ds/useHydrated";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

/**
 * Sign-in / registration form. It only talks to the auth endpoints; the server decides everything (the browser never
 * sends or chooses a user id), and the page is reloaded afterwards so every part of it sees the new state.
 *
 * The submit button is disabled until the page is ready (`useHydrated`). Before the scripts ran, a tap (or Enter)
 * submitted the form the browser's way: a GET to the same page with the email and password in the address (and so in
 * the browser history and server logs), the page reloaded and nothing was signed in. With the only submit button
 * disabled, Enter submits nothing either. The fields stay usable: they are read when the form is sent.
 *
 * Second layer: `method="post"`. Should the form ever be submitted without the app (scripts blocked or failed), the
 * browser sends the email and password in the request body, never in the address. The app always handles the submit
 * itself (`preventDefault`), so the method changes nothing when it runs.
 */
export function AuthForm({ mode, next }: { mode: "login" | "register"; next: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isRegister = mode === "register";
  const ready = useHydrated();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    try {
      const response = await fetch(isRegister ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(isRegister ? { email, password, name: email.split("@")[0] || "Student" } : { email, password }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string; error?: { message?: string } } | null;
        setError(friendlyMessage(response.status, body?.error?.message ?? body?.message, isRegister));
        return;
      }
      window.location.href = next; // full reload: the header and the practice history now reflect the signed-in account
    } catch {
      setError("We couldn't reach CEFRO. Check your internet connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form method="post" onSubmit={submit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium text-ink">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-base text-ink focus-visible:outline-2 focus-visible:outline-brand"
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium text-ink">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={isRegister ? "new-password" : "current-password"}
          required
          minLength={8}
          maxLength={128}
          aria-describedby={isRegister ? "password-hint" : undefined}
          className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-base text-ink focus-visible:outline-2 focus-visible:outline-brand"
        />
        {isRegister && (
          <p id="password-hint" className="text-sm text-muted">
            At least 8 characters.
          </p>
        )}
      </div>
      {error && <Alert tone="danger" title={error} />}
      <Button type="submit" size="lg" disabled={busy || !ready} className="w-full">
        {busy ? "One moment…" : isRegister ? "Create account" : "Sign in"}
      </Button>
    </form>
  );
}

function friendlyMessage(status: number, serverMessage: string | undefined, isRegister: boolean): string {
  if (status === 429) return serverMessage ?? "Too many attempts. Please wait a few minutes and try again.";
  if (isRegister && status === 422) return "That email can't be used to create an account. If you already have one, sign in instead.";
  if (!isRegister && (status === 401 || status === 400)) return "The email or password is not right.";
  return "Something went wrong. Please try again.";
}
