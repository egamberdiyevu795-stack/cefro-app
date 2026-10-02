import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native SQLite driver must be loaded from node_modules at runtime, not bundled.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
