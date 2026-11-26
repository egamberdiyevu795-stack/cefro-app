import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The build must not depend on a third party being up. Fetching the fonts from Google at build time
 * (`next/font/google`) failed the production build twice when that fetch blipped, so Inter is served from this app
 * instead. These tests fail the build if an edit brings the fetch back or loses a font file.
 */
const ROOT = process.cwd();
const WEIGHTS = [300, 400, 500, 600] as const;

const sourceFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(full);
    return /\.(tsx?|css)$/.test(e.name) ? [full] : [];
  });

describe("fonts are served from this app, not fetched at build time", () => {
  it("nothing imports next/font", () => {
    const offenders = sourceFiles(path.join(ROOT, "src")).filter((f) => fs.readFileSync(f, "utf8").includes("next/font"));
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });

  it("no stylesheet fetches a font from the network", () => {
    for (const file of sourceFiles(path.join(ROOT, "src"))) {
      const css = fs.readFileSync(file, "utf8");
      expect(css, path.relative(ROOT, file)).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
    }
  });

  it("ships every Inter weight the design system uses, with its licence", () => {
    for (const weight of WEIGHTS) {
      const file = path.join(ROOT, "public/fonts", `inter-latin-${weight}.woff2`);
      expect(fs.existsSync(file), `inter-latin-${weight}.woff2`).toBe(true);
      expect(fs.statSync(file).size).toBeGreaterThan(10_000); // a real font file, not a stub
    }
    expect(fs.existsSync(path.join(ROOT, "public/fonts/Inter-LICENSE.txt"))).toBe(true);
  });

  it("declares each of those weights, and preloads the one the first screen uses", () => {
    const css = fs.readFileSync(path.join(ROOT, "src/app/globals.css"), "utf8");
    for (const weight of WEIGHTS) {
      expect(css).toContain(`/fonts/inter-latin-${weight}.woff2`);
    }
    expect(css.match(/font-display:\s*swap/g)).toHaveLength(WEIGHTS.length);
    expect(fs.readFileSync(path.join(ROOT, "src/app/layout.tsx"), "utf8")).toContain('href="/fonts/inter-latin-400.woff2"');
  });
});
