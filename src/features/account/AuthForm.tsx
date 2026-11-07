"use client";

import { useState, type FormEvent } from "react";
import { Notice, PillAction, TextField } from "@/components/ds";
import { useHydrated } from "@/components/ds/useHydrated";
import { NAME_MAX_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, normaliseName, signUpNameProblem } from "@/domain/account";

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
 *
 * Built only from design-system components (`components/ds`), so a theme change restyles it. Registration asks for a
 * name, optional: left empty, the account has no name (a name is never made from the email). The server checks it
 * again (1–50 characters, not an email address).
 *
 * Mock mode (`mock`, the pages' `?mock=1`): the same form, but nothing is ever sent; submitting says so.
 */
export function AuthForm({ mode, next, mock = false }: { mode: "login" | "register"; next: string; mock?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [demoSent, setDemoSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const isRegister = mode === "register";
  const ready = useHydrated();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (mock) {
      setDemoSent(true); // mock mode never calls an API
      return;
    }
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const name = normaliseName(String(form.get("name") ?? ""));
    const problem = isRegister ? signUpNameProblem(name) : null;
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(isRegister ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(isRegister ? { email, password, name } : { email, password }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string; error?: { code?: string; message?: string } } | null;
        // The server's own name check (sign-up): its message says what to change.
        if (body?.error?.code === "invalid_name" && body.error.message) setError(body.error.message);
        else setError(friendlyMessage(response.status, body?.error?.message ?? body?.message, isRegister));
        return;
      }
      window.location.href = next; // full reload: every part of the page now reflects the signed-in account
    } catch {
      setError("We couldn't reach CEFRO. Check your internet connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form method="post" onSubmit={submit} className="space-y-4" noValidate>
      {isRegister && <TextField id="name" name="name" label="Name" type="text" autoComplete="name" maxLength={NAME_MAX_LENGTH} />}
      <TextField id="email" name="email" label="Email" type="email" autoComplete="email" required />
      <TextField
        id="password"
        name="password"
        label="Password"
        type="password"
        autoComplete={isRegister ? "new-password" : "current-password"}
        required
        minLength={PASSWORD_MIN_LENGTH}
        maxLength={PASSWORD_MAX_LENGTH}
        hint={isRegister ? "At least 8 characters." : undefined}
      />
      {error && <Notice tone="alert">{error}</Notice>}
      {demoSent && <Notice>Demo mode: nothing was sent and no account was used.</Notice>}
      <PillAction type="submit" size="lg" disabled={busy || !ready} className="w-full">
        {busy ? "One moment…" : isRegister ? "Create account" : "Sign in"}
      </PillAction>
    </form>
  );
}

function friendlyMessage(status: number, serverMessage: string | undefined, isRegister: boolean): string {
  if (status === 429) return serverMessage ?? "Too many attempts. Please wait a few minutes and try again.";
  if (isRegister && status === 422) return "That email can't be used to create an account. If you already have one, sign in instead.";
  if (!isRegister && (status === 401 || status === 400)) return "The email or password is not right.";
  return "Something went wrong. Please try again.";
}
