import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PART1_TASKS, getPart1Task } from "@/content/speaking/part1";
import { DevPart1Player } from "./DevPart1Player";

export const metadata: Metadata = { title: "Part 1 player (dev)", robots: { index: false } };

/**
 * DEV ONLY: tries the Part 1 question-by-question player in isolation (no upload, no evaluation).
 * Returns 404 in production builds.
 *
 *   /dev/part1-player?task=a2-part1-1-daily-life
 *   /dev/part1-player?task=b1-part1-2-shopping&timeScale=0.05   (shortened timings, for browser tests)
 */
export default async function DevPart1PlayerPage(props: PageProps<"/dev/part1-player">) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await props.searchParams;
  const taskId = typeof params.task === "string" ? params.task : PART1_TASKS[0]!.id;
  const task = getPart1Task(taskId);
  if (!task) notFound();
  const scale = typeof params.timeScale === "string" ? Number(params.timeScale) : 1;
  const timeScale = Number.isFinite(scale) && scale > 0 && scale <= 1 ? scale : 1;

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-record">Dev only</p>
        <h1 className="text-2xl font-semibold">
          Part {task.part}: {task.title}
        </h1>
        <p className="text-sm text-muted" data-testid="content-timings">
          Timings from content: {task.questions.map((q) => `${q.speakingSeconds} s`).join(" · ")} (preparation{" "}
          {task.questions.map((q) => `${q.prepSeconds} s`).join(" · ")})
        </p>
        {timeScale !== 1 && (
          <p className="text-sm text-muted" data-testid="time-scale">
            Time scale {timeScale} (dev)
          </p>
        )}
        <nav className="flex gap-3 text-sm">
          {PART1_TASKS.map((t) => (
            <a key={t.id} className="underline" href={`/dev/part1-player?task=${t.id}`}>
              Part {t.part}
            </a>
          ))}
        </nav>
      </div>
      <DevPart1Player key={`${task.id}:${timeScale}`} task={task} timeScale={timeScale} />
    </main>
  );
}
