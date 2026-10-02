import { Card, SectionTitle } from "@/components/ui/Card";
import { CRITERION_LABELS, CRITERION_SCORE_MAX, SPEAKING_CRITERIA } from "@/domain/evaluation/criteria";
import type { EvaluationResult } from "@/domain/evaluation/schema";
import { ScoreBar } from "./ScoreBar";

export function CriteriaScores({ criteria }: { criteria: EvaluationResult["criteria"] }) {
  return (
    <Card>
      <SectionTitle>Scores by criterion</SectionTitle>
      <ul className="mt-4 space-y-5">
        {SPEAKING_CRITERIA.map((key) => {
          const c = criteria[key];
          return (
            <li key={key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{CRITERION_LABELS[key]}</span>
                <span className="text-sm tabular-nums text-muted">
                  {c.assessable && c.score !== null ? (
                    <>
                      <span className="font-semibold text-ink">{c.score}</span>/{CRITERION_SCORE_MAX}
                      {c.level && <span className="ml-2">· {c.level}</span>}
                    </>
                  ) : (
                    "Not assessed"
                  )}
                </span>
              </div>
              <ScoreBar score={c.assessable ? c.score : null} className="mt-2" />
              <p className="mt-2 text-sm leading-relaxed text-muted">{c.justification}</p>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
