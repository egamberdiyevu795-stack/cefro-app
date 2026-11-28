import { test } from "@playwright/test";

/*
 * One-off mobile checkup (not part of the normal suite: it only runs from .github/workflows/ui-checkup.yml). Opens every
 * demo page at a phone's width, measures what goes wrong on a phone (sideways scroll, small tap targets, text under 11 px,
 * clipped text, things past the screen edge) and prints a compressed screenshot of each page into the log.
 */
test.skip(process.env.UI_CHECKUP !== "1", "only from the ui-checkup workflow");
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });

const PAGES = [
  "/practice/mock/demo-mock?mock=1",
  "/practice/mock/demo-mock?mock=1&state=scoring",
  "/practice/mock/demo-mock?mock=1&state=pending",
  "/practice/mock/demo-mock?mock=1&state=unfinished",
  "/practice/mock/demo-mock?mock=1&teacher=1",
  "/practice/mock/demo-mock/part-2?mock=1",
];

test("mobile checkup", async ({ page }) => {
  test.setTimeout(600_000);
  for (const url of PAGES) {
    const response = await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(1200);
    const metrics = await page.evaluate(() => {
      const vw = window.innerWidth;
      const out = { vw, status: 0, sideways: document.documentElement.scrollWidth > vw + 1 ? document.documentElement.scrollWidth : 0, small: [] as string[], wide: [] as string[], tiny: [] as string[], clipped: [] as string[], black: 0, height: document.documentElement.scrollHeight };
      for (const el of document.querySelectorAll("a,button,select,textarea,input:not([type=radio]):not([type=checkbox])")) {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (!r.width || !r.height || cs.visibility === "hidden" || el.closest(".sr-only")) continue;
        if (r.height < 36 || r.width < 36) out.small.push(`${(el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 26)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      for (const el of document.body.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (r.width && cs.position !== "fixed" && (r.right > vw + 1 || r.left < -1) && !el.closest("[class*=overflow]")) out.wide.push(`${el.tagName}.${String(el.className).slice(0, 28)} ${Math.round(r.left)}..${Math.round(r.right)}`);
        if (parseFloat(cs.fontSize) < 11 && [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim())) out.tiny.push(`${(el.textContent ?? "").trim().slice(0, 18)} ${cs.fontSize}`);
        if (["H1", "H2", "H3", "P", "SPAN", "A", "BUTTON", "LI"].includes(el.tagName) && el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== "visible") out.clipped.push((el.textContent ?? "").trim().slice(0, 28));
      }
      out.black = document.querySelectorAll(":is(a,button).bg-primary").length;
      for (const k of ["small", "wide", "tiny", "clipped"] as const) out[k] = [...new Set(out[k])].slice(0, 6);
      return out;
    });
    metrics.status = response?.status() ?? 0;
    const jpg = await page.screenshot({ fullPage: true, type: "jpeg", quality: 40 });
    process.stdout.write(`UICHECK_METRICS|${url}|${JSON.stringify(metrics)}\n`);
    process.stdout.write(`UICHECK_IMG|${url}|${jpg.toString("base64")}\n`);
  }
});
