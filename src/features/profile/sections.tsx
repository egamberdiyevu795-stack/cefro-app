import { Card, CardHeader, PillButton } from "@/components/ds";
import { mockLink } from "@/features/demo/demo-mode";
import { ChangePassword } from "@/features/settings/ChangePassword";
import { DeleteAccount } from "@/features/settings/DeleteAccount";
import { SignOut } from "@/features/settings/SignOut";
import type { AccountInfo } from "@/server/account/account-store";
import { ProfileName } from "./ProfileName";
import { PART2_HREF, attemptCountText, memberSinceText, type ProfileLevel } from "./view-model";

/**
 * (a) Name (editable), email (shown only), current level, member since and the number of practice attempts. A visitor
 * without an account: "Practising without an account" instead of name and email.
 */
export function AccountCard({ account, attempts, level, mock }: { account: AccountInfo; attempts: number; level: ProfileLevel; mock: boolean }) {
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
        <div className="border-t border-line pt-4">
          <LevelBlock level={level} mock={mock} />
        </div>
        <dl className="flex flex-col gap-1 border-t border-line pt-4 text-label text-fg-muted">
          {account.kind === "registered" && (
            <div>
              <dt className="sr-only">Member since</dt>
              <dd data-testid="profile-member-since">{memberSinceText(account.memberSince)}</dd>
            </div>
          )}
          <div>
            <dt className="sr-only">Practice attempts</dt>
            <dd data-testid="profile-attempts">{attemptCountText(attempts)}</dd>
          </div>
        </dl>
      </div>
    </Card>
  );
}

/**
 * The current level, from the latest scored Part 2 answer only (`currentLevel`). None: "No level yet" and a link to
 * Part 2. The black "Practise Part 2" / "Go to Part 2" is the page's one black control.
 */
function LevelBlock({ level, mock }: { level: ProfileLevel; mock: boolean }) {
  const href = mockLink(PART2_HREF, mock);
  return level.kind === "level" ? (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-caption text-fg-muted">Current level</p>
        <p className="text-stat font-light tracking-[-0.02em] text-fg" data-testid="profile-level">
          {level.level}
        </p>
        <p className="mt-2 text-label text-fg">{level.band}</p>
        <p className="mt-0.5 text-caption text-fg-muted">From your latest scored Part 2 answer, {level.date}</p>
      </div>
      <PillButton href={href}>Practise Part 2</PillButton>
    </div>
  ) : (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-caption text-fg-muted">Current level</p>
        <p className="mt-0.5 text-title font-medium tracking-[-0.01em] text-fg" data-testid="profile-level">
          No level yet
        </p>
        <p className="mt-0.5 text-body text-fg-muted">Answer a Part 2 task. Your level appears here once it is scored.</p>
      </div>
      <div>
        <PillButton href={href}>Go to Part 2</PillButton>
      </div>
    </div>
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
