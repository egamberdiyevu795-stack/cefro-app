import { expect, type Page } from "@playwright/test";

/**
 * On /practice each part's topic list is folded under "Or choose a topic", so every part card is the same height
 * whatever its list holds. A test that picks a topic by name opens that part's fold first, as a student does.
 * Already open (the part was linked by #part-N, or it has no fold): nothing to do.
 */
export async function openTopics(page: Page, part: "1.1" | "1.2" | "2" | "3"): Promise<void> {
  const card = page.locator(`#part-${part.replace(".", "-")}`);
  const fold = card.getByTestId("topic-fold");
  if ((await fold.count()) === 0) return;
  if (!(await fold.evaluate((el) => (el as HTMLDetailsElement).open))) {
    await fold.getByTestId("choose-topic").click();
  }
  await expect(fold.getByTestId("task-link").first()).toBeVisible();
}
