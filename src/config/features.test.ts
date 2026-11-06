import { describe, expect, it } from "vitest";
import { FEATURE_FLAGS, allFlags } from "./features";
import { navItemsFor } from "@/features/dashboard/mock-data";

describe("feature flags", () => {
  it("allFlags sets every flag", () => {
    expect(Object.values(allFlags(false)).every((v) => v === false)).toBe(true);
    expect(Object.keys(allFlags(true)).sort()).toEqual(Object.keys(FEATURE_FLAGS).sort());
  });

  it("flagged nav items are 'coming soon' when on and gone when off; History is a real link when on", () => {
    const on = navItemsFor(allFlags(true));
    expect(on.map((i) => i.label)).toEqual(["Dashboard", "Practice", "Lessons", "History", "Settings"]);
    expect(on.filter((i) => i.soon).map((i) => i.label)).toEqual(["Lessons", "Settings"]);
    expect(on.find((i) => i.label === "History")).toMatchObject({ href: "/history" });

    const off = navItemsFor(allFlags(false));
    expect(off.map((i) => i.label)).toEqual(["Dashboard", "Practice"]);
    expect(off.some((i) => i.soon)).toBe(false);
  });
});
