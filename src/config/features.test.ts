import { describe, expect, it } from "vitest";
import { FEATURE_FLAGS, allFlags } from "./features";
import { navItemsFor } from "@/features/dashboard/mock-data";

describe("feature flags", () => {
  it("allFlags sets every flag", () => {
    expect(Object.values(allFlags(false)).every((v) => v === false)).toBe(true);
    expect(Object.keys(allFlags(true)).sort()).toEqual(Object.keys(FEATURE_FLAGS).sort());
  });

  it("flagged nav items are 'coming soon' when on and gone when off; History and Settings are real links when on", () => {
    const on = navItemsFor(allFlags(true));
    expect(on.map((i) => i.label)).toEqual(["Dashboard", "Practice", "Lessons", "History", "Settings"]);
    expect(on.filter((i) => i.soon).map((i) => i.label)).toEqual(["Lessons"]);
    expect(on.find((i) => i.label === "History")).toMatchObject({ href: "/history" });
    expect(on.find((i) => i.label === "Settings")).toEqual({ href: "/settings", label: "Settings", icon: "settings" });
    // Mock mode: the gear keeps ?mock=1.
    expect(navItemsFor(allFlags(true), true).find((i) => i.label === "Settings")?.href).toBe("/settings?mock=1");

    const off = navItemsFor(allFlags(false));
    expect(off.map((i) => i.label)).toEqual(["Dashboard", "Practice"]);
    expect(off.some((i) => i.soon)).toBe(false);
  });
});
