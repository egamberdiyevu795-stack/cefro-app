"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Notice, PillAction, TextField, cx, styles } from "@/components/ds";
import { useHydrated } from "@/components/ds/useHydrated";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/domain/account";
import { TEACHER_TERMS_TEXT } from "@/domain/teacher/rules";
import { SIGN_IN } from "@/features/entry/content";

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
 * Built only from design-system components (`components/ds`), so a theme change restyles it. Registration asks only
 * for email and password: it sends an empty name, so the account starts with none (a name is never made from the
 * email) and the student sets it later on the Account page. The server's name rules (1–50 characters after trimming,
 * not an email address) still apply to any name a sign-up request sends.
 *
 * Registration also asks who the account is for. "A teacher" is chosen here, not approved by the owner: the role on
 * its own opens no student's work (a teacher sees an answer only after that student joins their class with its code
 * and shares it), so the terms line under it is all it takes. The account is created first and its role set straight
 * after, so a failure there still leaves a working account that the Account page can switch.
 *
 * Mock mode (`mock`, the pages' `?mock=1`): the same form, but nothing is ever sent; submitting says so.
 *
 * `forgotHref` (sign in only): the "Forgot password?" link under the password, given only when this server can send the
 * reset email (server/email/email.ts), so it is never a link to a dead end.
 */
export function AuthForm({ mode, next, mock = false, forgotHref }: { mode: "login" | "register"; next: string; mock?: boolean; forgotHref?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [demoSent, setDemoSent] = useState(false);
  const [busy, setBusy] = useState(false);
  // Sign-up only: who the account is for. A teacher's account is the same account with classes; the role opens no
  // student's work by itself, so nobody has to approve it.
  const [role, setRole] = useState<"student" | "teacher">("student");
  const [terms, setTerms] = useState(false);
  const isRegister = mode === "register";
  const ready = useHydrated();
  const needsTerms = isRegister && role === "teacher" && !terms;

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
    setBusy(true);
    try {
      const response = await fetch(isRegister ? "/api/auth/sign-up/email" : "/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(isRegister ? { email, password, name: "" } : { email, password }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string; error?: { code?: string; message?: string } } | null;
        // The server's own name check (sign-up; never hit by this form, which sends no name): its message says what to change.
        if (body?.error?.code === "invalid_name" && body.error.message) setError(body.error.message);
        else setError(friendlyMessage(response.status, body?.error?.message ?? body?.message, isRegister));
        return;
      }
      // The account exists and is signed in; now its role. A failure here leaves a working student account, and the
      // Account page can still switch it, so it never costs the person their sign-up.
      if (isRegister && role === "teacher") {
        const roleResponse = await fetch("/api/account/role", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ role: "teacher", acceptedTerms: true }),
        });
        if (!roleResponse.ok) {
          setError("Your account was created, but we couldn't set it up as a teacher. Open Account to switch it.");
          return;
        }
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
      {isRegister && (
        <fieldset className="space-y-3">
          <legend className="text-caption font-semibold text-fg">I will use CEFRO as…</legend>
          <RoleSegment current={role} onPick={setRole} ready={ready} />
          {role === "teacher" && (
            <label className="flex cursor-pointer items-start gap-3 text-body text-fg-muted">
              <input
                type="checkbox"
                name="terms"
                checked={terms}
                onChange={(event) => setTerms(event.currentTarget.checked)}
                disabled={!ready}
                className="mt-0.5 size-4 shrink-0 accent-primary"
              />
              <span>{TEACHER_TERMS_TEXT}</span>
            </label>
          )}
        </fieldset>
      )}
      {!isRegister && forgotHref && (
        <p className="-mt-2 flex justify-end">
          <Link href={forgotHref} className={cx("inline-flex min-h-11 items-center px-1 text-body text-fg-muted underline underline-offset-4", styles.FOCUS_RING)}>
            {SIGN_IN.forgot}
          </Link>
        </p>
      )}
      {error && <Notice tone="alert">{error}</Notice>}
      {demoSent && <Notice>Demo mode: nothing was sent and no account was used.</Notice>}
      <PillAction type="submit" size="lg" disabled={busy || !ready || needsTerms} className="w-full">
        {busy ? "One moment…" : isRegister ? "Create account" : "Sign in"}
      </PillAction>
    </form>
  );
}

const ROLE_LINES = {
  student: "Practise, get my level and see what to fix first.",
  teacher: "Create a class and follow my students' speaking.",
} as const;

/**
 * Who the account is for, as a two-part switch (grey track, the chosen side a white pill) with one line under it for the
 * chosen role. Real radio buttons underneath, so the keyboard and screen readers work as they would for any radio group.
 */
function RoleSegment({ current, onPick, ready }: { current: "student" | "teacher"; onPick: (role: "student" | "teacher") => void; ready: boolean }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-1 rounded-full bg-well p-1">
        {(["student", "teacher"] as const).map((value) => {
          const picked = current === value;
          return (
            <label
              key={value}
              className={cx(
                "flex h-11 cursor-pointer items-center justify-center rounded-full text-body font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-fg",
                picked ? "bg-card text-fg shadow-card" : "text-fg-muted hover:text-fg",
              )}
            >
              <input type="radio" name="role" value={value} checked={picked} onChange={() => onPick(value)} disabled={!ready} className="sr-only" />
              {value === "student" ? "Student" : "Teacher"}
            </label>
          );
        })}
      </div>
      <p className="text-label text-fg-muted" aria-live="polite">
        {ROLE_LINES[current]}
      </p>
    </>
  );
}

function friendlyMessage(status: number, serverMessage: string | undefined, isRegister: boolean): string {
  if (status === 429) return serverMessage ?? "Too many attempts. Please wait a few minutes and try again.";
  if (isRegister && status === 422) return "That email can't be used to create an account. If you already have one, sign in instead.";
  if (!isRegister && (status === 401 || status === 400)) return "The email or password is not right.";
  return "Something went wrong. Please try again.";
}
