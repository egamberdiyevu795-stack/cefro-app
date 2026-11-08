import { cx } from "./cx";

/** Large rounded off-white surface with the single soft shadow. */
export function Card({ className, children, ...rest }: React.ComponentProps<"section">) {
  return (
    <section className={cx("rounded-card bg-card p-5 shadow-card sm:p-6", className)} {...rest}>
      {children}
    </section>
  );
}

/** Quiet card title with an optional action on the right, followed by a thin divider. */
export function CardHeader({ title, id, action, className }: { title: string; id?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cx("mb-5 flex min-h-11 items-center justify-between gap-3 border-b border-line pb-4", className)}>
      <h2 id={id} className="text-title font-medium tracking-[-0.01em] text-fg">
        {title}
      </h2>
      {action}
    </div>
  );
}
