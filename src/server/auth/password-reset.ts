import "server-only";
import { sendEmail } from "@/server/email/email";
import { logger } from "@/server/logging/logger";

/**
 * The "Forgot password" email. The auth library makes the one-time token (random, stored in auth_verifications, valid
 * for RESET_LINK_MINUTES, deleted when used) and calls this; the link opens CEFRO's own page, /reset-password, which
 * sends the token back with the new password (POST /api/account/reset-password).
 *
 * A failure to send is logged and swallowed: the answer to "Forgot password" must be the same whether or not the
 * address has an account (a sending error only happens for real accounts, so letting it through would tell a stranger
 * which addresses are registered). The student sees "check your email"; the owner sees the error in the logs.
 */
export const RESET_LINK_MINUTES = 60;

export function resetPasswordLink(origin: string, token: string): string {
  return `${origin}/reset-password?token=${encodeURIComponent(token)}`;
}

export function passwordResetEmail(to: string, link: string) {
  const subject = "Reset your CEFRO password";
  const text = [
    "Hi,",
    "",
    `Someone asked to reset the password of your CEFRO account (${to}).`,
    `To choose a new password, open this link. It works once, for ${RESET_LINK_MINUTES} minutes:`,
    "",
    link,
    "",
    "If you did not ask for this, you can ignore this email. Your password stays the same.",
    "",
    "CEFRO",
  ].join("\n");
  const safeLink = escapeHtml(link);
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#111;margin:0;padding:24px;">
<p>Hi,</p>
<p>Someone asked to reset the password of your CEFRO account (${escapeHtml(to)}).</p>
<p>To choose a new password, open this link. It works once, for ${RESET_LINK_MINUTES} minutes.</p>
<p><a href="${safeLink}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;">Choose a new password</a></p>
<p style="font-size:14px;color:#444;">If the button does not work, copy this link into your browser:<br><a href="${safeLink}" style="color:#111;word-break:break-all;">${safeLink}</a></p>
<p>If you did not ask for this, you can ignore this email. Your password stays the same.</p>
<p>CEFRO</p>
</body></html>`;
  return { to, subject, text, html };
}

export async function sendPasswordResetEmail({ to, origin, token }: { to: string; origin: string; token: string }): Promise<void> {
  try {
    await sendEmail(passwordResetEmail(to, resetPasswordLink(origin, token)));
  } catch (error) {
    // No address and no token in the log line (the token would let anyone reading logs set the password).
    logger.error("Password reset email could not be sent", { error: error instanceof Error ? error.message : String(error) });
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
