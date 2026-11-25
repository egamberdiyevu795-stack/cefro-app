import type { Metadata } from "next";
import { connection } from "next/server";
import { FEATURE_FLAGS } from "@/config/features";
import { shownLessons } from "@/content/lessons";
import { isMockQuery, mockLink } from "@/features/demo/demo-mode";
import { LessonList } from "@/features/lessons/LessonList";
import { AppShell } from "@/features/shell/AppShell";
import { assertServerConfigured } from "@/server/config/boot-check";

export const metadata: Metadata = { title: "Lessons" };

/*
 * The Lessons tab: every approved lesson (`shownLessons`; a draft is never listed). Each row opens its lesson without
 * a result (/lessons/<slug>): the lesson, its drill and "Go to Part 2". Lessons are static content: no database.
 *
 * `?mock=1` (mock mode): the same list, every link keeps ?mock=1, no configuration check. Without it this is a real
 * page and checks the configuration like every other real page.
 */
export default async function LessonsPage(props: PageProps<"/lessons">) {
  const query = await props.searchParams;
  const mock = isMockQuery(query);
  if (!mock) {
    await connection();
    assertServerConfigured();
  }
  return (
    <AppShell flags={FEATURE_FLAGS} account={mock ? "mock" : "real"} back={false} activeHref="/lessons">
      <LessonList lessons={shownLessons()} href={(lesson) => mockLink(`/lessons/${encodeURIComponent(lesson.slug)}`, mock)} />
    </AppShell>
  );
}
