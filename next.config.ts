import type { NextConfig } from "next";
import { buildSecurityHeaders } from "./src/security-headers";

const nextConfig: NextConfig = {
  // Native SQLite driver must be loaded from node_modules at runtime, not bundled.
  serverExternalPackages: ["better-sqlite3"],
  async headers() {
    return [{ source: "/:path*", headers: buildSecurityHeaders() }];
  },
};

export default nextConfig;
