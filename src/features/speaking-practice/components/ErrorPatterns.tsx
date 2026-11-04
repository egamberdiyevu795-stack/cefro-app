import type { ErrorPattern, LanguageError } from "@/domain/evaluation/multilevel/model-output";
import { ErrorList } from "./FeatureLevels";

/**
 * Mistakes grouped by the habit behind them ("Missing -s after he/she/it"), each group with its rule and a fix,
 * followed by one-off corrections. Fixing a pattern changes many sentences at once.
 */
export function ErrorPatterns({ errors, patterns }: { errors: LanguageError[]; patterns: ErrorPattern[] }) {
  const grouped = patterns
    .map((pattern) => ({ pattern, errors: errors.filter((e) => e.pattern === pattern.name) }))
    .filter((group) => group.errors.length > 0);
  const oneOffs = errors.filter((e) => !grouped.some((g) => g.pattern.name === e.pattern));
  if (grouped.length === 0 && oneOffs.length === 0) return null;
  return (
    <div className="space-y-3">
      {grouped.map(({ pattern, errors: items }) => (
        <div key={pattern.name} className="rounded-xl bg-surface-muted p-3" data-testid="error-pattern">
          <p className="text-sm font-semibold">
            {pattern.name}
            {items.length > 1 && <span className="ml-1.5 font-normal text-subtle">· {items.length} times</span>}
          </p>
          <p className="mt-1 text-sm text-muted">{pattern.rule}</p>
          <div className="mt-2">
            <ErrorList errors={items} />
          </div>
          <p className="mt-2 text-sm">
            <span className="font-medium">Fix: </span>
            {pattern.how_to_fix}
          </p>
        </div>
      ))}
      {oneOffs.length > 0 && (
        <div>
          {grouped.length > 0 && <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-subtle">Other corrections</p>}
          <ErrorList errors={oneOffs} />
        </div>
      )}
    </div>
  );
}
