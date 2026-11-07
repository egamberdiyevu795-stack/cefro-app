import { Card, CardHeader, PillButton } from "@/components/ds";
import { mockLink } from "@/features/demo/demo-mode";
import type { AccountInfo } from "@/server/account/account-store";
import { ProfileName } from "./ProfileName";
import { PART2_HREF, attemptCountText, memberSinceText, type ProfileLevel } from "./view-model";

/** Name (editable), email (shown only), member since and the number of practice attempts. */
export function AccountCard({ account, attempts, mock }: { account: AccountInfo; attempts: number; mock: boolean }) {
  return (
    <Card aria-labelledby="profile-account">
      <CardHeader title="Your account" id="profile-account" />
      {account.kind === "registered" ? (
        <div className="flex flex-col gap-4">
          <ProfileName name={account.name} demo={mock} />
          <div>
            <p className="text-caption text-fg-muted">Email</p>
            <p className="mt-0.5 break-all text-body text-fg" data-testid="profile-email">
              {account.email}
            </p>
          </div>
          <dl className="flex flex-col gap-1 text-label text-fg-muted">
            <div>
              <dt className="sr-only">Member since</dt>
              <dd data-testid="profile-member-since">{memberSinceText(account.memberSince)}</dd>
            </div>
            <div>
              <dt className="sr-only">Practice attempts</dt>
              <dd data-testid="profile-attempts">{attemptCountText(attempts)}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-body font-semibold text-fg">Practising without an account</p>
            <p className="mt-0.5 text-body text-fg-muted">Your answers are kept in this browser. Create an account to keep them on any device.</p>
          </div>
          <p className="text-label text-fg-muted" data-testid="profile-attempts">
            {attemptCountText(attempts)}
          </p>
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

/**
 * The current level, from the latest scored Part 2 answer only (`currentLevel`). None: "No level yet" and a link to
 * Part 2. The black "Practise Part 2" / "Go to Part 2" is the page's one black control.
 */
export function LevelCard({ level, mock }: { level: ProfileLevel; mock: boolean }) {
  const href = mockLink(PART2_HREF, mock);
  return (
    <Card aria-labelledby="profile-level">
      <CardHeader title="Current level" id="profile-level" />
      {level.kind === "level" ? (
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-stat font-light tracking-[-0.02em] text-fg" data-testid="profile-level">
              {level.level}
            </p>
            <p className="mt-2 text-label text-fg">{level.band}</p>
            <p className="mt-0.5 text-caption text-fg-muted">From your latest scored Part 2 answer, {level.date}</p>
          </div>
          <div>
            <PillButton href={href}>Practise Part 2</PillButton>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-title font-medium tracking-[-0.01em] text-fg" data-testid="profile-level">
              No level yet
            </p>
            <p className="mt-0.5 text-body text-fg-muted">Answer a Part 2 task. Your level appears here once it is scored.</p>
          </div>
          <div>
            <PillButton href={href}>Go to Part 2</PillButton>
          </div>
        </div>
      )}
    </Card>
  );
}
