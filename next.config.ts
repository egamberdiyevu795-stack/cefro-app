import type { NextConfig } from "next";
import { buildSecurityHeaders } from "./src/security-headers";

const nextConfig: NextConfig = {
  // The native libSQL module (local development database) and the static ffmpeg binary must be loaded from
  // node_modules at runtime, not bundled. The hosted-database client (@libsql/client/web) is plain JavaScript.
  serverExternalPackages: ["@libsql/client", "libsql", "ffmpeg-static"],
  // Files that are read at runtime without being imported, so the build's file tracing cannot see them. On Vercel only
  // traced files are shipped with a function: the SQL migrations (read by the start-up check that the hosted database is
  // migrated) and the ffmpeg binary used by the speech activity guard (only the two routes that process an attempt run it).
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
