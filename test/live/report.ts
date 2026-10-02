import fs from "node:fs";
import path from "node:path";

/** Reports are written to eval-reports/ (gitignored): they contain model output for human review. */
export function writeReport(name: string, markdown: string, data: unknown): string {
  const dir = path.join(process.cwd(), "eval-reports");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = path.join(dir, `${name}-${stamp}`);
  fs.writeFileSync(`${base}.md`, markdown);
  fs.writeFileSync(`${base}.json`, JSON.stringify(data, null, 2));
  return `${base}.md`;
}
