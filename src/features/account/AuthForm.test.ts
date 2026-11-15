import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuthForm } from "./AuthForm";

/**
 * The sign-in and registration forms carry email and password. If the browser ever sends them itself (before the
 * page's scripts run, or when they fail), it must POST them in the body: a GET would put them in the address, the
 * browser history and server logs. And the submit button starts disabled in the server HTML (`useHydrated`).
 */
describe("AuthForm", () => {
  it.each(["login", "register"] as const)("%s: method post, no action that leaves the page, submit disabled until ready", (mode) => {
    const html = renderToStaticMarkup(createElement(AuthForm, { mode, next: "/" }));
    const form = /<form\b[^>]*>/.exec(html)?.[0] ?? "";
    expect(form).toMatch(/\bmethod="post"/);
    expect(form).not.toMatch(/\baction=/); // posts to the page itself, never to another site
    const tags = (name: string) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "g"))].map((m) => m[0]);
    expect(tags("input").some((t) => t.includes('name="password"') && t.includes('type="password"'))).toBe(true);
    const submit = tags("button").filter((t) => t.includes('type="submit"'));
    expect(submit).toHaveLength(1);
    expect(submit[0]).toContain('disabled=""');
  });
});
