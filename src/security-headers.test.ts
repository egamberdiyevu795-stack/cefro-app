import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";
import { buildContentSecurityPolicy, buildSecurityHeaders } from "./security-headers";

const asMap = (env: { NODE_ENV?: string }) => new Map(buildSecurityHeaders(env).map((h) => [h.key, h.value]));

describe("security headers", () => {
  it("sets the baseline in production", () => {
    const h = asMap({ NODE_ENV: "production" });
    expect(h.get("X-Content-Type-Options")).toBe("nosniff");
    expect(h.get("X-Frame-Options")).toBe("DENY");
    expect(h.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(h.get("Strict-Transport-Security")).toContain("max-age=31536000");
    expect(h.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
  });

  it("allows the microphone for this origin only and no other powerful feature", () => {
    const policy = asMap({ NODE_ENV: "production" }).get("Permissions-Policy")!;
    expect(policy).toContain("microphone=(self)");
    for (const feature of ["camera", "geolocation", "payment"]) expect(policy).toContain(`${feature}=()`);
  });

  it("forbids framing, plugins and foreign connections, but keeps audio playback working", () => {
    const csp = buildContentSecurityPolicy(false);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toMatch(/connect-src[^;]*ws:/);
    expect(csp).not.toContain("unsafe-eval");
    // The recorder previews the student's own recording through a blob: URL, and playback uses /api/.../audio.
    expect(csp).toMatch(/media-src 'self' blob:/);
    expect(csp).not.toContain("*");
  });

  it("relaxes only what development tooling needs, and never sends HSTS outside production", () => {
    const csp = buildContentSecurityPolicy(true);
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toMatch(/connect-src[^;]*ws:/);
    expect(asMap({ NODE_ENV: "development" }).has("Strict-Transport-Security")).toBe(false);
  });

  it("is applied to every route through next.config", async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0].source).toBe("/:path*");
    expect(rules[0].headers.map((h) => h.key)).toContain("Content-Security-Policy");
  });
});
