import { cn } from "@/components/ui/cn";
import { formatClock } from "../lib/format";

/** Circular countdown. Purely presentational: values come from the practice state. */
export function CountdownRing({
  remainingMs,
  totalMs,
  label,
  tone = "brand",
}: {
  remainingMs: number;
  totalMs: number;
  label: string;
  tone?: "brand" | "record";
}) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const progress = totalMs > 0 ? remainingMs / totalMs : 0;
  return (
    <div className="relative mx-auto size-44" role="timer" aria-live="off" aria-label={`${label}: ${formatClock(remainingMs)} remaining`}>
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle cx="60" cy="60" r={radius} fill="none" strokeWidth="8" className="stroke-surface-muted" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          className={cn("transition-[stroke-dashoffset] duration-200", tone === "brand" ? "stroke-brand" : "stroke-record")}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-4xl font-semibold tabular-nums">{formatClock(remainingMs)}</span>
        <span className="mt-1 text-xs font-medium uppercase tracking-wide text-subtle">{label}</span>
      </div>
    </div>
  );
}
