/**
 * Baseline browser security headers, applied to every route from next.config.ts.
 *
 * CSP note: scripts need 'unsafe-inline' because Next.js emits inline bootstrap scripts and a
 * nonce-based policy would force every page to render dynamically (the home page is static today).
 * Tightening to nonces is a recorded follow-up (docs/ARCHITECTURE_DECISIONS.md). Everything else is strict:
 * no framing, no plugins, same-origin connections, and audio only from this origin or a local blob:
 * (the recorder previews the student's own recording through a blob: URL).
 */
export function buildContentSecurityPolicy(isDevelopment: boolean): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // React's dev tooling needs eval; production does not.
    "script-src": ["'self'", "'unsafe-inline'", ...(isDevelopment ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "media-src": ["'self'", "blob:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...(isDevelopment ? ["ws:", "wss:"] : [])],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

export function buildSecurityHeaders(env: { NODE_ENV?: string } = process.env): { key: string; value: string }[] {
  const isDevelopment = env.NODE_ENV !== "production";
  return [
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy(isDevelopment) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Legacy equivalent of frame-ancestors for older browsers.
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // The microphone is the one powerful feature CEFRO uses, and only for its own pages.
    { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=(), payment=(), usb=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    // Only meaningful (and only sent) over HTTPS in production.
    ...(isDevelopment ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
  ];
}
