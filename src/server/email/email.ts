import "server-only";
import { appendFile } from "node:fs/promises";
import { getEnv, type ServerEnv } from "@/server/config/env";
import { logger } from "@/server/logging/logger";

/**
 * Sending email (today: only the "Forgot password" link). Provider-agnostic: any SMTP service works (a Gmail account
 * with an app password for the pilot, Resend / Brevo / Mailgun / Amazon SES later with CEFRO's own domain), so changing
 * service is a change of environment variables, never of code. Setup: docs/password-reset.md.
 *
 * Which sender is used (`EMAIL_PROVIDER`):
 *  - "auto" (default): SMTP when SMTP_HOST, SMTP_USER and SMTP_PASSWORD are all set; otherwise "log" in development and
 *    tests, and "off" in production.
 *  - "smtp": SMTP (and "off" when one of the three is missing: a half-configured sender never pretends to work).
 *  - "log": nothing leaves the server; the message is written to the server log (and to EMAIL_OUTBOX_FILE when set,
 *    which the browser tests read). Refused in production, where it would put working reset links in the logs.
 *  - "off": email is not sent; features that need it are hidden ("Forgot password?" is not shown).
 */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type EmailMode = "smtp" | "log" | "off";

export function emailMode(env: ServerEnv = getEnv()): EmailMode {
  const smtpReady = Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD);
  const production = env.NODE_ENV === "production";
  switch (env.EMAIL_PROVIDER) {
    case "smtp":
      return smtpReady ? "smtp" : "off";
    case "log":
      return production ? "off" : "log";
    case "off":
      return "off";
    default:
      return smtpReady ? "smtp" : production ? "off" : "log";
  }
}

/** Can this server send email at all? (Decides whether "Forgot password?" is offered.) */
export function emailAvailable(env: ServerEnv = getEnv()): boolean {
  return emailMode(env) !== "off";
}

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("Email sending is not configured (docs/password-reset.md).");
  }
}

/** Sends one message, or throws (EmailNotConfiguredError when there is no sender; the transport's error otherwise). */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const env = getEnv();
  const mode = emailMode(env);
  if (mode === "off") throw new EmailNotConfiguredError();
  if (mode === "log") {
    logger.info("Email not sent (EMAIL_PROVIDER log): development only", { to: message.to, subject: message.subject, text: message.text });
    if (env.EMAIL_OUTBOX_FILE) await appendFile(env.EMAIL_OUTBOX_FILE, `${JSON.stringify({ ...message, at: new Date().toISOString() })}\n`);
    return;
  }
  // Loaded only when SMTP is really used, so development and tests never load the transport.
  const { createTransport } = await import("nodemailer");
  const port = env.SMTP_PORT;
  const transport = createTransport({
    host: env.SMTP_HOST,
    port,
    secure: port === 465, // 465: TLS from the start; 587 (and others): STARTTLS, required below
    requireTLS: port !== 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  await transport.sendMail({ from: env.EMAIL_FROM ?? `CEFRO <${env.SMTP_USER}>`, to: message.to, subject: message.subject, text: message.text, html: message.html });
}
