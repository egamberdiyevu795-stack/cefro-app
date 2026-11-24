import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { PART_LIVE } from "@/config/features";
import { listAllSpeakingTasks } from "@/content/speaking";
import { listArgumentTasks } from "@/content/speaking/part3";
import { examPartOf } from "@/domain/speaking/exam-part";
import type { HistoryAttempt } from "@/domain/speaking/history";
import { isMockQuery } from "@/features/demo/demo-mode";
import { part3PracticeHref, part3RealPracticeHref } from "@/features/part3/links";
import { practiceHref } from "@/features/speaking-practice/lib/practice-flow";
import { isTopicPart, pickRandomTopic } from "@/features/task-list/random-task";
import { listAttemptHistory } from "@/server/attempts/attempt-service";
import { assertServerConfigured } from "@/server/config/boot-check";
import { demoAttempts } from "@/server/demo/demo-data";
import { findCurrentUserId } from "@/server/identity/current-user";

/*
 * `/practice/random/1.2`, `/practice/random/2` and `/practice/random/3`: the task list's "Random topic". Picks a topic of the part, as the exam
 * would (features/task-list/random-task.ts: never practised first, then the least recent, never the last one twice), then
 * opens its brief. The brief hides the questions until the student starts, so the topic is a surprise there too.
 *
 * A page that only redirects, on each request (the task list's link is not prefetched), so every tap is a fresh pick.
 * Real page: only for a live part (`PART_LIVE`), otherwise 404, like the topics' own pages. `?mock=1`: the demo
 * student's attempts, and the topic opens in mock mode.
 */
export default async function RandomTopicPage(props: PageProps<"/practice/random/[part]">) {
  const [{ part }, query] = await Promise.all([props.params, props.searchParams]);
  if (!isTopicPart(part)) notFound();
  const mock = isMockQuery(query);
  const live = PART_LIVE[part];
  if (!mock && !live) notFound();
  await connection();
  if (!mock) assertServerConfigured();

  const userId = mock ? null : await findCurrentUserId();
  const attempts: HistoryAttempt[] = mock ? await demoAttempts(new Date()) : userId ? await listAttemptHistory(userId) : [];

  if (part === "3") {
    const id = pickRandomTopic(listArgumentTasks().map((t) => t.id), attempts);
    if (!id) notFound();
    redirect(live && !mock ? part3RealPracticeHref(id) : part3PracticeHref(id));
  }

  const id = pickRandomTopic(
    listAllSpeakingTasks()
      .filter((t) => examPartOf(t) === part)
      .map((t) => t.id),
    attempts,
  );
  if (!id) notFound();
  redirect(practiceHref(id, { mock }));
}
