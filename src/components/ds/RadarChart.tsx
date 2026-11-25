import { useId } from "react";

export type RadarAxis = {
  label: string;
  /** Short label for narrow charts (e.g. "Gram"). */
  short: string;
  /** Ring index, 0 = innermost; null = not assessed (dashed point, no polygon vertex). */
  value: number | null;
};

const NOT_ASSESSED_TEXT = "Not assessed";

/**
 * Radar chart on ordinal rings (not percentages): each ring is a level, innermost first.
 * Thin grey grid, accent outline with dots, and the design system's only gradient as the fill.
 *
 * Text is never drawn below 11 px: the chart has two fixed-size versions and picks one from the width of its own box
 * (a container query). Wide (≥ 23rem): full skill names, each with its level under it. Narrow: short names, and the
 * levels listed under the chart. The list is always present for screen readers.
 */
export function RadarChart({
  axes,
  rings,
  label,
  placeholder,
}: {
  axes: readonly RadarAxis[];
  rings: readonly string[];
  label: string;
  /**
   * Empty chart (nothing assessed yet): this short text in the middle instead of a shape, and no "Not assessed" notes
   * or level list, so the chart only shows what the student will get.
   */
  placeholder?: string;
}) {
  return (
    <figure className="@container m-0">
      <div className="hidden @min-[23rem]:block">
        <RadarSvg variant="full" axes={axes} rings={rings} label={label} placeholder={placeholder} />
      </div>
      <div className="@min-[23rem]:hidden">
        <RadarSvg variant="compact" axes={axes} rings={rings} label={label} placeholder={placeholder} />
      </div>
      {placeholder ? (
        <figcaption className="sr-only">{placeholder}</figcaption>
      ) : (
        <figcaption className="@min-[23rem]:sr-only">
          <ul className="mt-4 border-t border-line pt-3">
            {axes.map((a) => (
              <li key={a.label} className="flex items-center justify-between gap-4 py-1 text-label">
                <span className="text-fg-muted">{a.label}</span>
                <span className="font-semibold text-fg">{a.value === null ? NOT_ASSESSED_TEXT : rings[a.value]}</span>
              </li>
            ))}
          </ul>
        </figcaption>
      )}
    </figure>
  );
}

const VARIANTS = {
  // Rendered at its natural size when the box is ≥ 23rem (368 px), so 12-unit text is 12 px.
  full: { W: 368, H: 300, R: 98, axisFont: 12, gap: 14 },
  // Natural size 300 px; may shrink to ~0.86 in the narrowest box, so 13-unit text stays ≥ 11 px.
  compact: { W: 300, H: 250, R: 82, axisFont: 13, gap: 12 },
} as const;

function RadarSvg({
  variant,
  axes,
  rings,
  label,
  placeholder,
}: {
  variant: keyof typeof VARIANTS;
  axes: readonly RadarAxis[];
  rings: readonly string[];
  label: string;
  placeholder?: string;
}) {
  const gradientId = useId();
  const { W, H, R, axisFont, gap } = VARIANTS[variant];
  const cx = W / 2;
  const cy = H / 2 + 6;
  const n = axes.length;

  const point = (i: number, r: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  };
  const ringRadius = (ring: number) => (R * (ring + 1)) / rings.length;
  const fmt = (p: readonly [number, number]) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`;

  const assessed = axes.flatMap((a, i) => (a.value === null ? [] : [point(i, ringRadius(a.value))]));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      className="mx-auto block h-auto max-w-full overflow-visible"
      role="img"
      aria-label={label}
    >
      <defs>
        <radialGradient id={gradientId} cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor="var(--color-radar-core)" stopOpacity="1" />
          <stop offset="100%" stopColor="var(--color-radar-edge)" stopOpacity="0.7" />
        </radialGradient>
      </defs>

      {rings.map((_, r) => (
        <polygon key={r} points={axes.map((_, i) => fmt(point(i, ringRadius(r)))).join(" ")} fill="none" stroke="var(--color-line)" />
      ))}
      {axes.map((a, i) => {
        const [x, y] = point(i, R);
        return (
          <line
            key={a.label}
            x1={cx}
            y1={cy}
            x2={x}
            y2={y}
            stroke={a.value === null ? "var(--color-fg-subtle)" : "var(--color-line)"}
            strokeDasharray={a.value === null ? "3 3" : undefined}
          />
        );
      })}

      {assessed.length >= 3 && (
        <polygon
          points={assessed.map(fmt).join(" ")}
          fill={`url(#${gradientId})`}
          stroke="var(--color-accent)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      )}
      {assessed.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3" fill="var(--color-accent)" />
      ))}
      {/* Not assessed: a hollow dashed point at the end of the axis, outside the data. */}
      {axes.map((a, i) => {
        if (a.value !== null || placeholder) return null;
        const [x, y] = point(i, R);
        return <circle key={a.label} cx={x} cy={y} r="5" fill="var(--color-card)" stroke="var(--color-fg-muted)" strokeDasharray="2 2" />;
      })}

      {placeholder && (
        <text
          x={cx}
          y={cy + axisFont / 3}
          textAnchor="middle"
          fontSize={axisFont}
          fill="var(--color-fg-muted)"
          stroke="var(--color-card)"
          strokeWidth="4"
          paintOrder="stroke"
          data-testid="radar-placeholder"
        >
          {placeholder}
        </text>
      )}

      {axes.map((a, i) => {
        const [x, y] = point(i, R + gap);
        const anchor = Math.abs(x - cx) < 4 ? "middle" : x > cx ? "start" : "end";
        const top = y < cy - R / 2;
        // Full size: the level under each skill name (never drawn inside the shape, where it is hard to read).
        const note = variant !== "full" || placeholder ? null : a.value === null ? NOT_ASSESSED_TEXT : rings[a.value];
        // Labels near the top sit on their point (one line higher when the level goes under them, so the level clears
        // the axis end); lower ones are nudged down so they clear the axis end.
        const baseY = top ? y - (note ? axisFont + 2 : 0) : y + axisFont / 3;
        return (
          <text key={a.label} x={x} y={baseY} textAnchor={anchor} fontSize={axisFont} fill="var(--color-fg)">
            {variant === "full" ? a.label : a.short}
            {note && (
              <tspan x={x} dy={axisFont + 2} fontSize="11" fill="var(--color-fg-muted)">
                {note}
              </tspan>
            )}
          </text>
        );
      })}
    </svg>
  );
}
