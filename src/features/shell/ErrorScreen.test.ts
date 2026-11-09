import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ErrorScreen } from "./ErrorScreen";

const render = (digest?: string) => renderToStaticMarkup(createElement(ErrorScreen, { digest, onRetry: () => {} }));

describe("page-failure screen", () => {
  it("says the service is unavailable, and promises nothing about saved answers (the database may be what failed)", () => {
    const html = render("2061102054");
    expect(html).toContain("CEFRO isn’t available right now");
    expect(html).toContain("Something on our side isn’t working, so this page can’t open. Please try again in a few minutes.");
    expect(html).not.toMatch(/safe/i);
    expect(html).not.toMatch(/earlier answers|your answers/i);
    expect(html).toContain("Reference: 2061102054");
  });

  it("one black button (Try again), a quiet link to the dashboard, no text under 11 px", () => {
    const html = render();
    expect(html.match(/class="[^"]*\bbg-primary text-on-primary\b/g) ?? []).toHaveLength(1);
    expect(html).toContain("Try again");
    expect(html).toContain('href="/dashboard"');
    expect(html).not.toContain("Reference:");
    expect(html).not.toMatch(/text-\[(\d|10)(\.\d+)?px\]|text-xs\b/);
  });
});
