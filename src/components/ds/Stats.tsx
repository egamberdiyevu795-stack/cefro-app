import { cx } from "./cx";
import { Icon } from "./Icon";

/** Label | value row: muted label, thin vertical divider, right-aligned semibold value. */
export function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[1fr_5.5rem] items-center gap-4 py-1.5">
      <dt className="text-label text-fg-muted">{label}</dt>
      <dd className="border-l border-line text-right text-label font-semibold text-fg">{value}</dd>
    </div>
  );
}

/** Thin accent bar on a grey track. `value` is 0–1. */
export function ProgressBar({ value, label, className }: { value: number; label: string; className?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cx("h-1 w-full overflow-hidden rounded-full bg-well", className)}
    >
      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Goal pill: black check square, sentence, and a quiet fill showing how far along the goal is. `value` is 0–1. */
export function GoalBar({ value, children }: { value: number; children: React.ReactNode }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="relative flex h-9 items-center gap-2.5 overflow-hidden rounded-full bg-well pl-1.5 pr-4" role="group">
      <div aria-hidden="true" className="absolute inset-y-0 left-0 bg-primary/[0.05]" style={{ width: `${pct}%` }} />
      <span className="relative flex size-6 items-center justify-center rounded-lg bg-primary text-on-primary">
        <Icon name="check" size={14} />
      </span>
      <span className="relative text-label text-fg">{children}</span>
    </div>
  );
}
