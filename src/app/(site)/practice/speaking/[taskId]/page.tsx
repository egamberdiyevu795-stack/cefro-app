import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSpeakingTask } from "@/content/speaking";
import { toPublicTask } from "@/domain/speaking/task";
import { PracticeExperience } from "@/features/speaking-practice/components/PracticeExperience";

export async function generateMetadata(props: PageProps<"/practice/speaking/[taskId]">): Promise<Metadata> {
  const { taskId } = await props.params;
  const task = getSpeakingTask(taskId);
  return { title: task ? `${task.level} Speaking Part ${task.part}: ${task.title}` : "Task not found" };
}

export default async function SpeakingPracticePage(props: PageProps<"/practice/speaking/[taskId]">) {
  const { taskId } = await props.params;
  const task = getSpeakingTask(taskId);
  if (!task) notFound();
  // Only the public part of the task reaches the browser (no evaluator guidance).
  return <PracticeExperience task={toPublicTask(task)} />;
}
