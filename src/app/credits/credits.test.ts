import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

let pathname = "/";
let query = "";
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useSearchParams: () => new URLSearchParams(query) }));

import { SiteFooter } from "@/components/SiteFooter";
import CreditsPage from "./page";

describe("Credits page", () => {
  const html = renderToStaticMarkup(CreditsPage());
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  it("gives the attribution CC BY 4.0 asks for: creators, licence link, corpus link, the model, and the changes", () => {
    for (const name of ["Heiga Zen", "Viet Dang", "Rob Clark", "Yu Zhang", "Ron J. Weiss", "Ye Jia", "Zhifeng Chen", "Yonghui Wu"]) expect(text).toContain(name);
    expect(text).toContain("LibriTTS");
    expect(text).toContain("CC BY 4.0");
    expect(text).toContain("en-us-libritts-high");
    expect(text).toContain("Piper");
    expect(text).toContain("slowed down");
    expect(html).toContain('href="https://creativecommons.org/licenses/by/4.0/"');
    expect(html).toContain('href="http://www.openslr.org/60/"');
    expect(html).toContain('href="https://github.com/rhasspy/piper"');
  });

  it("matches the attribution recorded next to the audio files (public/audio/speaking/part1/README.md)", async () => {
    const readme = (await import("node:fs")).readFileSync("public/audio/speaking/part1/README.md", "utf8").replace(/\s+/g, " ");
    const creators = "Heiga Zen, Viet Dang, Rob Clark, Yu Zhang, Ron J. Weiss, Ye Jia, Zhifeng Chen and Yonghui Wu";
    expect(readme).toContain(creators);
    expect(text).toContain(creators);
  });

  it("is a plain page: one heading, no button, no form", () => {
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<form");
  });
});

describe("the footer", () => {
  it("is one quiet link to /credits, no button", () => {
    pathname = "/dashboard";
    const html = renderToStaticMarkup(createElement(SiteFooter));
    expect(html).toContain('href="/credits"');
    expect(html).toContain("Credits");
    expect(html).not.toContain("<button");
  });

  it("keeps ?mock=1 in mock mode, like every other link of the app, and not otherwise", () => {
    pathname = "/dashboard";
    query = "mock=1";
    expect(renderToStaticMarkup(createElement(SiteFooter))).toContain('href="/credits?mock=1"');
    query = "";
    expect(renderToStaticMarkup(createElement(SiteFooter))).toContain('href="/credits"');
  });

  it("is left out of the exam laptop page only (no link out there), and shown on the pages around it", () => {
    pathname = "/teacher/classes/c1/exam/m1/laptop";
    expect(renderToStaticMarkup(createElement(SiteFooter))).toBe("");
    for (const p of ["/teacher/classes/c1/exam/m1", "/teacher/classes/c1/exam", "/credits", "/", "/practice/mock"]) {
      pathname = p;
      expect(renderToStaticMarkup(createElement(SiteFooter)), p).toContain('href="/credits"');
    }
  });
});
