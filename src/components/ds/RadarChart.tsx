import { useId } from "react";

export type RadarAxis = { label: string; /** Ring index, 0 = innermost. */ value: number };

/**
 * Radar chart on ordinal rings (not percentages): each ring is a level, innermost first.
 * Thin grey grid, accent outline with dots, and the design system's only gradient as the fill.
 */
export function RadarChart({ axes, rings, label }: { axes: readonly RadarAxis[]; rings: readonly string[]; label: string }) {
  const gradientId = useId();
  const W = 420;
  const H = 320;
  const cx = W / 2;
  const cy = H / 2 + 4;
  const R = 120;
  const n = axes.length;

  const point = (i: number, r: number) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  };
  const ringRadius = (ring: number) => (R * (ring + 1)) / rings.length;
  const polygon = (rFor: (i: number) => number) =>
    axes.map((_, i) => point(i, rFor(i)).map((v) => v.toFixed(1)).join(",")).join(" ");

  const data = axes.map((a, i) => point(i, ringRadius(a.value)));

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label}>
        <defs>
          <radialGradient id={gradientId} cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="var(--color-radar-core)" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--color-radar-edge)" stopOpacity="0.7" />
          </radialGradient>
        </defs>

        {rings.map((_, r) => (
          <polygon key={r} points={polygon(() => ringRadius(r))} fill="none" stroke="var(--color-line)" strokeWidth="1" />
        ))}
        {axes.map((_, i) => {
          const [x, y] = point(i, R);
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--color-line)" strokeWidth="1" />;
        })}

        <polygon
          points={data.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}
          fill={`url(#${gradientId})`}
          stroke="var(--color-accent)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {data.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3" fill="var(--color-accent)" />
        ))}

        {/* Ring names along the top axis, right of it. */}
        {rings.map((name, r) => (
          <text
            key={name}
            x={cx + 5}
            y={cy - ringRadius(r) + 11}
            fontSize="10"
            fill="var(--color-fg-muted)"
            stroke="var(--color-card)"
            strokeWidth="3"
            paintOrder="stroke"
          >
            {name}
          </text>
        ))}

        {axes.map((a, i) => {
          const [x, y] = point(i, R + 18);
          const anchor = Math.abs(x - cx) < 4 ? "middle" : x > cx ? "start" : "end";
          return (
            <text key={a.label} x={x} y={y + 4} textAnchor={anchor} fontSize="12" fill="var(--color-fg)">
              {a.label}
            </text>
          );
        })}
      </svg>
      <figcaption className="sr-only">
        {axes.map((a) => `${a.label}: ${rings[a.value]}`).join("; ")}
      </figcaption>
    </figure>
  );
}
