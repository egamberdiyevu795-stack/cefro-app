import { cx } from "./cx";

/**
 * A two-or-more part switch: a grey track, the chosen part a white pill. Real radio buttons underneath (visually hidden),
 * so the keyboard, screen readers and forms work as they would for any radio group. Put it inside a fieldset with a
 * legend; `onChange` gets the chosen value.
 */
export function Segmented<T extends string>({
  name,
  options,
  value,
  onChange,
  disabled,
}: {
  name: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-1 rounded-full bg-well p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => {
        const picked = value === option.value;
        return (
          <label
            key={option.value}
            className={cx(
              "flex min-h-11 cursor-pointer items-center justify-center rounded-full px-3 text-center text-body font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-fg",
              picked ? "bg-card text-fg shadow-card" : "text-fg-muted hover:text-fg",
            )}
          >
            <input type="radio" name={name} value={option.value} checked={picked} onChange={() => onChange(option.value)} disabled={disabled} className="sr-only" />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}
