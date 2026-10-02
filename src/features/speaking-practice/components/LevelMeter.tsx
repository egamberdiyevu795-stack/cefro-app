import { cn } from "@/components/ui/cn";

/** Simple input-level bars so students can see the microphone is hearing them. */
export function LevelMeter({ level, className }: { level: number; className?: string }) {
  const bars = 12;
  const active = Math.round(level * bars);
  return (
    <div className={cn("flex h-6 items-end gap-1", className)} aria-hidden>
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className={cn("w-1.5 rounded-full transition-all duration-75", i < active ? "bg-record" : "bg-surface-muted")}
          style={{ height: `${30 + (i / bars) * 70}%` }}
        />
      ))}
    </div>
  );
}
