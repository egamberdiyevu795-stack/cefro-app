import { expect, type Page } from "@playwright/test";

/**
 * On /practice each part's topic list is folded under "Or choose a topic", so every part card is the same height
 * whatever its list holds. A test that picks a topic by name opens that part's fold first, as a student does.
 * Waits for the card, so it also works right after a navigation; a part with no fold (Part 1.1, whose list IS the
 * part) and a fold already open (the part was linked by #part-N) are both left as they are.
 */
export async function openTopics(page: Page, part: "1.1" | "1.2" | "2" | "3"): Promise<void> {
  const card = page.locator(`#part-${part.replace(".", "-")}`);
  await expect(card).toBeVisible();
  const fold = card.getByTestId("topic-fold");
  if ((await fold.count()) === 0) return; // no list to fold
  const summary = fold.getByTestId("choose-topic");
  await expect(summary).toBeVisible();
  if (!(await fold.evaluate((el) => (el as HTMLDetailsElement).open))) await summary.click();
  await expect(fold.getByTestId("task-link").first()).toBeVisible();
}
