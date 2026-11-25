import Link from "next/link";
import { Card, CardHeader, PillButton, cx, styles } from "@/components/ds";
import { mockLink } from "@/features/demo/demo-mode";
import { ChangePassword } from "@/features/settings/ChangePassword";
import { DeleteAccount } from "@/features/settings/DeleteAccount";
import { SignOut } from "@/features/settings/SignOut";
import { consentLines, type ConsentRecord } from "@/domain/consent";
import type { AccountInfo } from "@/server/account/account-store";
import { ProfileName } from "./ProfileName";
import { attemptCountText, memberSinceText, type ProfileLevel } from "./view-model";

/**
 * (a) Name (editable), email (shown only), current level, member since and the number of practice attempts. A visitor
 * without an account: "Practising without an account" instead of name and email.
 */
export function AccountCard({
  account,
  attempts,
  level,
  mock,
  showLevel = true,
}: {
  account: AccountInfo;
  attempts: number;
  level: ProfileLevel;
  mock: boolean;
  /** False for a teacher: their Account is their account, not a student's level and practice count. */
  showLevel?: boolean;
}) {
  return (
    <Card aria-labelledby="account-you">
      <CardHeader title="Your account" id="account-you" />
      <div className="flex flex-col gap-5">
        {account.kind === "registered" ? (
          <div className="flex flex-col gap-4">
            <ProfileName name={account.name} demo={mock} />
            <div>
              <p className="text-caption text-fg-muted">Email</p>
              <p className="mt-0.5 break-all text-body text-fg" data-testid="profile-email">
                {account.email}
              </p>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-body font-semibold text-fg">Practising without an account</p>
            <p className="mt-0.5 text-body text-fg-muted">Your answers are kept in this browser. Create an account to keep them on any device.</p>
          </div>
        )}
        {showLevel && (
          <div className="border-t border-line pt-4">
            <LevelBlock level={level} mock={mock} />
          </div>
        )}
        <dl className="flex flex-col gap-1 border-t border-line pt-4 text-label text-fg-muted">
          {account.kind === "registered" && (
            <div>
              <dt className="sr-only">Member since</dt>
              <dd data-testid="profile-member-since">{memberSinceText(account.memberSince)}</dd>
            </div>
          )}
          {showLevel && (
            <div>
              <dt className="sr-only">Practice attempts</dt>
              <dd data-testid="profile-attempts">{attemptCountText(attempts)}</dd>
            </div>
          )}
        </dl>
      </div>
    </Card>
  );
}

/**
 * The current level: the same level, target and basis as Home (`currentLevel`). Information, not a call to action:
 * Account is where the student changes their name, password or exam date, so it holds no practice button (the black
 * one belongs on Home). With no level yet, a quiet text link to Home, never a button.
 */
function LevelBlock({ level, mock }: { level: ProfileLevel; mock: boolean }) {
  return level.kind === "level" ? (
    <div>
      <p className="text-caption text-fg-muted">Current level</p>
      <p className="flex items-baseline gap-2">
        <span className="text-stat font-light tracking-[-0.02em] text-fg" data-testid="profile-level">
          {level.level}
        </span>
        <span className="text-lead font-medium text-fg">· target {level.target}</span>
      </p>
      <p className="mt-1 text-caption text-fg-muted">{level.basis}</p>
    </div>
  ) : (
    <div>
      <p className="text-caption text-fg-muted">Current level</p>
      <p className="mt-0.5 text-title font-medium tracking-[-0.01em] text-fg" data-testid="profile-level">
        No level yet
      </p>
      <p className="mt-0.5 text-body text-fg-muted">
        Answer a Part 2 task and your level appears here.{" "}
        <Link href={mockLink("/dashboard", mock)} className={cx("font-medium text-fg underline underline-offset-2", styles.FOCUS_RING)}>
          Find your level on Home
        </Link>
      </p>
    </div>
  );
}

/**
 * Recording consent (pilot, docs/consent-design.md section 2b): shown only while consent is required. Read-only: only
 * the owner can record consent (scripts/set-consent.mjs), so there is no button here. Withdrawing for good is Delete my
 * account, below.
 */
export function ConsentCard({ record }: { record: ConsentRecord }) {
  const lines = consentLines(record);
  return (
    <Card aria-labelledby="account-consent">
      <CardHeader title="Recording consent" id="account-consent" />
      <div className="flex flex-col gap-2" data-testid="consent-status" data-status={record.status ?? "waiting"}>
        <p className="text-body font-semibold text-fg">{lines.title}</p>
        <p className="text-body text-fg">{lines.body}</p>
        <p className="border-t border-line pt-3 text-label text-fg-muted">{lines.retention}</p>
      </div>
    </Card>
  );
}

/** (c) Change password, then Sign out. Without an account: Sign in / Create account instead. */
export function SignInCard({ signedIn, mock }: { signedIn: boolean; mock: boolean }) {
  return (
    <Card aria-labelledby="account-sign-in">
      <CardHeader title={signedIn ? "Password and sign-in" : "Sign in"} id="account-sign-in" />
      {signedIn ? (
        <div className="flex flex-col gap-5">
          <div>
            <h3 className="mb-3 text-body font-semibold text-fg">Change password</h3>
            <ChangePassword demo={mock} />
          </div>
          <div className="border-t border-line pt-4">
            <h3 className="mb-3 text-body font-semibold text-fg">Sign out</h3>
            <SignOut demo={mock} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-body text-fg-muted">Sign in to keep your practice on any device, change your password or delete your account.</p>
          <div className="flex flex-wrap gap-2">
            <PillButton href="/login?next=/profile" variant="quiet">
              Sign in
            </PillButton>
            <PillButton href="/register?next=/profile" variant="quiet">
              Create account
            </PillButton>
          </div>
        </div>
      )}
    </Card>
  );
}

/** (d) Delete my account: last, in its own section. Accounts only. */
export function DeleteCard({ mock, items }: { mock: boolean; items: readonly string[] }) {
  return (
    <Card aria-labelledby="account-delete">
      <CardHeader title="Delete my account" id="account-delete" />
      <DeleteAccount demo={mock} items={items} />
    </Card>
  );
}
