import { describe, expect, it } from "vitest";
import { resultBack } from "./back-link";

describe("resultBack: where a part's result leads back to", () => {
  const MOCK = "aaaaaaaa-0000-4000-8000-000000000001";

  it("History when the student came from History, even if the part belongs to a mock", () => {
    expect(resultBack({ referer: "https://cefro.example/history?part=2", mockId: null })).toEqual({ href: "/history", label: "History" });
    expect(resultBack({ referer: "https://cefro.example/history", mockId: MOCK })).toEqual({ href: "/history", label: "History" });
  });

  it("the mock's overview when the part belongs to a mock (also after a reload, with no referrer)", () => {
    expect(resultBack({ referer: null, mockId: MOCK })).toEqual({ href: `/practice/mock/${MOCK}`, label: "Mock exam" });
    expect(resultBack({ referer: `https://cefro.example/practice/mock/${MOCK}`, mockId: MOCK })).toEqual({ href: `/practice/mock/${MOCK}`, label: "Mock exam" });
  });

  it("nothing (the shell's default) for a single practice, an unknown or broken referrer", () => {
    expect(resultBack({ referer: null, mockId: null })).toBeUndefined();
    expect(resultBack({ referer: "not a url", mockId: null })).toBeUndefined();
    expect(resultBack({ referer: "https://cefro.example/practice", mockId: null })).toBeUndefined();
  });

  it("never builds a link that leaves the site, whatever the referrer says", () => {
    const back = resultBack({ referer: "https://evil.example/history", mockId: null });
    expect(back?.href).toBe("/history");
    expect(resultBack({ referer: null, mockId: "../../x?y" })?.href).toBe("/practice/mock/..%2F..%2Fx%3Fy");
  });
});
