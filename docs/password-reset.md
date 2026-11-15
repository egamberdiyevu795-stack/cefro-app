# Forgot password

Branch `claude/project-thread-je2jm7` (from `claude/p1-stability`, 2026-11-15). **No migration** (the reset tokens use
the library's existing `auth_verifications` table, created by `0003`).

## What the student sees (phone first)

1. **Sign in** → small grey **Forgot password?** under the password (only when the server can send email, see below).
2. **Forgot your password?** → Email → black **Send link** → "If an account uses this email, we have sent it a link. The
   link works for 60 minutes. Check your spam folder too." The same words whether or not the address has an account.
3. The email "Reset your CEFRO password": a button **Choose a new password**, the link written out, "If you did not ask
   for this, you can ignore this email."
4. **Choose a new password** (`/reset-password?token=…`) → New password ("At least 8 characters.") → black **Save new
   password** → "Your password is changed. Sign in with your new password." → black **Sign in**.
5. A used, expired or broken link: "This link has expired or was already used. Ask for a new one." → black **Send a new link**.

Mock mode (`/login?mock=1`, `/forgot-password?mock=1`, `/reset-password?mock=1`): every step is clickable, nothing is sent.

## Rules (and where they are enforced)

| Rule | Where |
| --- | --- |
| Token: random, one use, 60 minutes, stored by the auth library | `server/auth/auth.ts` (`sendResetPassword`, `resetPasswordTokenExpiresIn`) |
| Same answer for unknown addresses; a sending error is logged, never shown | `api/account/forgot-password`, `server/auth/password-reset.ts` |
| 3 emails per address per hour, 30 per client IP per hour; new-password attempts 30 per IP per 15 min | `server/auth/auth-limits.ts` |
| New password: same rules as Create account (8 to 128 characters) | `domain/account.ts` `newPasswordProblem` |
| After a reset: signed out on every device, other waiting links cancelled, wrong-password lock lifted | `server/auth/auth.ts` (`revokeSessionsOnPasswordReset`, `onPasswordReset`) |
| Cross-site requests refused; no referrer leaves the reset page; no token or address in logs | the two routes, `reset-password/page.tsx`, `password-reset.ts` |
| `/api/auth/*` still exposes only sign-up, sign-in and sign-out | `api/auth/[...all]/route.ts` (unchanged) |

Tests: `src/app/api/account/password-reset.test.ts`, `password-reset-off.test.ts`, `e2e/forgot-password.spec.ts`
(390 px phone, full flow with the email read from the test outbox), `e2e/no-dead-controls.spec.ts` (the new pages).

## What the owner must set up (once, about 10 minutes)

The app sends email through **SMTP**, which every email service offers, so the service can change later with no code
change. **Until these variables are set, production simply does not show "Forgot password?"** (and the page says "Password
reset by email is not switched on yet. Ask your teacher for help."). Nothing breaks.

### For the pilot: a Gmail account (free, no domain needed)

1. Make a **new** Gmail account for the app (for example `cefro.app@gmail.com`), so students never see your personal address.
2. In that account: **Google Account → Security → 2-Step Verification** → turn it on.
3. Then **Google Account → Security → 2-Step Verification → App passwords** (or search "App passwords" in the account
   settings) → name it `CEFRO` → copy the 16-letter password (shown once).
4. **Vercel → cefro-app-mgm6 → Settings → Environment Variables**, environment **Production** (and Preview if you want to
   test there), add:

| Name | Value |
| --- | --- |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | the new Gmail address |
| `SMTP_PASSWORD` | the 16-letter app password (no spaces) |
| `EMAIL_FROM` | `CEFRO <the new Gmail address>` |

5. **Redeploy**. Check: open `/login`, the **Forgot password?** link is there; send a link to your own account.

Gmail allows about 500 emails a day, far more than the pilot needs. Gmail always shows the Gmail address as the sender.

### For public launch: an email service with CEFRO's own domain

When CEFRO has its own domain, use a sending service (Resend, Brevo, Mailgun or Amazon SES) for better delivery. Each gives
SMTP settings after you verify the domain; put them in the same five variables. Example, Resend: `SMTP_HOST=smtp.resend.com`,
`SMTP_PORT=465`, `SMTP_USER=resend`, `SMTP_PASSWORD=<the Resend API key>`, `EMAIL_FROM=CEFRO <no-reply@your-domain>`.
A `vercel.app` address cannot be verified as a sending domain.

### Other settings (normally leave alone)

- `EMAIL_PROVIDER`: `auto` (default) = SMTP when the three SMTP values are set; `off` hides the feature even when they are.
  `log` (development only, refused in production) writes the email to the server log instead of sending it.
- `SMTP_PORT=587` works too (STARTTLS) for services that prefer it.

### If students say the email never came

1. Spam folder first. 2. Vercel → Logs, search "Password reset email could not be sent": the line says why (for example
"Invalid login": the app password is wrong or was revoked; make a new one and update `SMTP_PASSWORD`, then Redeploy).
