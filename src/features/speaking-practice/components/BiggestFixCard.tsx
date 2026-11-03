import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { FEATURE_LABELS, type Feature } from "@/domain/evaluation/multilevel/levels";
import type { MultilevelResult } from "@/domain/evaluation/multilevel/result";
import type { PublicSpeakingTask } from "@/domain/speaking/task";
import { ErrorList, levelText, levelTone } from "./FeatureLevels";

/**
 * "The biggest thing to fix", chosen in code from the band logic: when the questions answered limit the band more
 * than the language does, it is the first unanswered question (by its real number); otherwise the lowest feature.
 */
export function BiggestFixCard({ result, task }: { result: MultilevelResult; task: PublicSpeakingTask }) {
  const fix = result.scoring.biggest_fix;
  if (fix.kind === "question_coverage") return <QuestionFix result={result} task={task} questionId={fix.question_id} />;
  if (fix.kind === "own_words") return <OwnWordsFix />;
  return <FeatureFix result={result} feature={fix.feature} />;
}

function QuestionFix({ result, task, questionId }: { result: MultilevelResult; task: PublicSpeakingTask; questionId: number }) {
  const question = result.assessment.questions.find((q) => q.id === questionId);
  const missed = result.assessment.questions.filter((q) => q.status === "missing" || q.status === "off_topic").map((q) => q.id);
  return (
    <Card className="space-y-4 border-warning/50">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="danger">{question?.status === "off_topic" ? "Off topic" : "Not answered"}</Badge>
        <Badge>Question coverage</Badge>
      </div>
      <h3 className="text-xl font-semibold leading-snug">
        Answer question {questionId}: &ldquo;{task.prompts[questionId - 1]}&rdquo;
      </h3>
      {question?.note && <p className="text-sm text-muted">{question.note}</p>}
      <p className="text-sm leading-relaxed">
        Your language is good enough for a higher band, but {missed.length > 1 ? `questions ${missed.join(" and ")} were` : `question ${questionId} was`} not
        answered. Each question you leave out lowers the highest band you can get, so answering it is the quickest way to raise your band.
      </p>
    </Card>
  );
}

function OwnWordsFix() {
  return (
    <Card className="space-y-3 border-warning/50">
      <Badge tone="danger">Not an answer to these questions</Badge>
      <h3 className="text-xl font-semibold leading-snug">Answer the questions you are asked, in your own words</h3>
      <p className="text-sm leading-relaxed">
        Your answer looks memorised or does not answer this task, so it gets band 0 whatever the language. Start each part of your answer by
        answering one of the questions directly.
      </p>
    </Card>
  );
}

function FeatureFix({ result, feature }: { result: MultilevelResult; feature: Feature }) {
  const f = result.assessment.features[feature];
  const errors = result.assessment.errors.filter((e) => e.type === feature);
  return (
    <Card className="space-y-4 border-warning/50">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={levelTone(f.level)}>{levelText(f.level)}</Badge>
        <Badge>{FEATURE_LABELS[feature]}</Badge>
      </div>
      <h3 className="text-xl font-semibold leading-snug">{f.note || FEATURE_LABELS[feature]}</h3>
      {f.evidence.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">What you said</p>
          <div className="mt-1 space-y-1">
            {f.evidence.map((quote) => (
              <blockquote key={quote} className="border-l-2 border-warning/60 pl-3 text-sm italic text-muted">
                &ldquo;{quote}&rdquo;
              </blockquote>
            ))}
          </div>
        </div>
      )}
      {errors.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Corrections</p>
          <div className="mt-1">
            <ErrorList errors={errors} />
          </div>
        </div>
      )}
      {f.how_to_improve && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">What to do</p>
          <p className="mt-1 text-sm leading-relaxed">{f.how_to_improve}</p>
        </div>
      )}
    </Card>
  );
}
