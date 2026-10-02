import fs from "node:fs";

// Load .env.local (if present) so live runs use the same configuration as the app.
for (const file of [".env.local", ".env"]) {
  if (fs.existsSync(file)) process.loadEnvFile(file);
}
