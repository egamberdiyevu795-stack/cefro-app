import { describe, expect, it } from "vitest";
import { FEATURE_FLAGS, allFlags } from "./features";
import { navItemsFor } from "@/features/dashboard/mock-data";

describe("feature flags", () => {
  it("allFlags sets every flag", () => {
    expect(Object.values(allFlags(false)).every((v) => v === false)).toBe(true);
    expect(Object.keys(allFlags(true)).sort()).toEqual(Object.keys(FEATURE_FLAGS).sort());
  });

  it("the navigation: Home, Practice, Lessons, History, all real links; History gone when off; no Settings tab", () => {
    const on = navItemsFor(allFlags(true));
    expect(on.map((i) => i.label)).toEqual(["Home", "Practice", "Lessons", "History"]);
    expect(on.find((i) => i.label === "Lessons")).toMatchObject({ href: "/lessons" });
    expect(on.find((i) => i.label === "History")).toMatchObject({ href: "/history" });
    expect(navItemsFor(allFlags(true), true).map((i) => i.href)).toEqual(["/dashboard?mock=1", "/practice?mock=1", "/lessons?mock=1", "/history?mock=1"]);
    expect(on.some((i) => i.href.startsWith("/settings"))).toBe(false);
    // The fifth tab, Account, is the AccountTab component (checked in mock-pages.test.ts).

    const off = navItemsFor(allFlags(false));
    expect(off.map((i) => i.label)).toEqual(["Home", "Practice", "Lessons"]);
  });
});
