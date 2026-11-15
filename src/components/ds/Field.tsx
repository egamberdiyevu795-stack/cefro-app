import Link from "next/link";
import { cx } from "./cx";
import { FOCUS_RING } from "./styles";

/**
 * A labelled text field: muted label above, a 44 px pill input (border `fg-subtle`, 3.64:1 on the card: an input
 * boundary needs 3:1), an optional muted hint under it, tied to the input by `aria-describedby`.
 * Every other prop goes to the `<input>` (name, type, autoComplete, required…).
 */
export function TextField({
  id,
  label,
  hint,
  className,
  ...input
}: Omit<React.ComponentProps<"input">, "id" | "className"> & { id: string; label: string; hint?: string; className?: string }) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={cx("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-label font-medium text-fg-muted">
        {label}
      </label>
      <input
        id={id}
        aria-describedby={hintId}
        className={cx("h-11 w-full min-w-0 rounded-full border border-fg-subtle bg-card px-4 text-body text-fg", FOCUS_RING)}
        {...input}
      />
      {hint && (
        <p id={hintId} className="text-label text-fg-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * A short message in a quiet `well` box: `alert` for a problem the student must fix (announced at once), `status` for
 * news (announced politely). Words only, never colour.
 */
export function Notice({ tone = "status", className, children, ...rest }: React.ComponentProps<"p"> & { tone?: "alert" | "status" }) {
  return (
    <p role={tone} className={cx("rounded-tile bg-well px-4 py-3 text-body text-fg", className)} {...rest}>
      {children}
    </p>
  );
}

/** The CEFRO wordmark as a link (dashboard, task pages, the signed-out pages). */
export function WordmarkLink({ href, className = "flex" }: { href: string; className?: string }) {
  return (
    <Link href={href} className={cx("items-center text-body font-semibold tracking-[0.08em] text-fg", FOCUS_RING, className)}>
      CEFRO
    </Link>
  );
}
