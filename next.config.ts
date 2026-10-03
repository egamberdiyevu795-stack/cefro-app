import type { NextConfig } from "next";
import { buildSecurityHeaders } from "./src/security-headers";

const nextConfig: NextConfig = {
  // Native SQLite driver and the static ffmpeg binary must be loaded from node_modules at runtime, not bundled.
  serverExternalPackages: ["better-sqlite3", "ffmpeg-static"],
  // Files that are read at runtime without being imported, so the build's file tracing cannot see them. On Vercel only
  // traced files are shipped with a function: the SQL migrations (every route that touches the database applies them on
  // first use) and the ffmpeg binary used by the speech activity guard (only the two routes that process an attempt run it).
  outputFileTracingIncludes: {
    "/**": ["./src/server/db/migrations/**/*"],
    "/api/speaking/attempts": ["./node_modules/ffmpeg-static/ffmpeg"],
    "/api/speaking/attempts/\\[attemptId\\]/process": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
  async headers() {
    return [{ source: "/:path*", headers: buildSecurityHeaders() }];
  },
};

export default nextConfig;
