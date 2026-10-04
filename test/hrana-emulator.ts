import http from "node:http";
import type { AddressInfo } from "node:net";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

/**
 * A minimal Hrana-over-HTTP (protocol v2, JSON) endpoint backed by SQLite, so scripts that talk to a hosted libSQL
 * database can be run end to end with the real client, without a network and without credentials.
 * It checks the bearer token, enforces foreign keys, and implements execute / batch (with conditions) / close.
 * It is NOT Turso: it proves our code and SQL speak the protocol correctly, not that the hosted service accepts them.
 */
export interface Emulator {
  url: string;
  requests: string[];
  close(): Promise<void>;
}

type Arg = { type: string; value?: string; base64?: string };
type Stmt = { sql: string; args?: Arg[] };
type Cond = { type: string; step?: number; cond?: Cond; conds?: Cond[] } | undefined;

export async function startHranaEmulator(options: { token: string; status?: number }): Promise<Emulator> {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  const requests: string[] = [];

  const toValue = (v: unknown) =>
    v === null ? { type: "null" } : typeof v === "bigint" ? { type: "integer", value: String(v) } : typeof v === "number" ? { type: "float", value: v } : v instanceof Uint8Array ? { type: "blob", base64: Buffer.from(v).toString("base64") } : { type: "text", value: String(v) };
  const fromArg = (a: Arg): SQLInputValue => (a.type === "null" ? null : a.type === "integer" ? BigInt(a.value!) : a.type === "float" ? Number(a.value) : a.type === "blob" ? Buffer.from(a.base64!, "base64") : (a.value as string));

  function exec(stmt: Stmt) {
    const prepared = db.prepare(stmt.sql);
    const args = (stmt.args ?? []).map(fromArg);
    const cols = prepared.columns().map((c) => ({ name: c.name, decltype: c.type ?? null }));
    prepared.setReadBigInts(true);
    if (cols.length > 0) {
      return { cols, rows: prepared.all(...args).map((row) => Object.values(row).map(toValue)), affected_row_count: 0, last_insert_rowid: null };
    }
    const result = prepared.run(...args);
    return { cols: [], rows: [], affected_row_count: Number(result.changes), last_insert_rowid: String(result.lastInsertRowid) };
  }

  function holds(cond: Cond, ok: boolean[], errors: unknown[]): boolean {
    if (!cond) return true;
    switch (cond.type) {
      case "ok": return ok[cond.step!] === true;
      case "error": return errors[cond.step!] != null;
      case "not": return !holds(cond.cond, ok, errors);
      case "and": return cond.conds!.every((c) => holds(c, ok, errors));
      case "or": return cond.conds!.some((c) => holds(c, ok, errors));
      case "is_autocommit": return !db.isTransaction;
      default: return false;
    }
  }

  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      if (options.status) {
        res.writeHead(options.status);
        return res.end("rejected");
      }
      if (req.headers.authorization !== `Bearer ${options.token}`) {
        res.writeHead(401);
        return res.end("unauthorized");
      }
      if (req.url === "/v2" && req.method === "GET") {
        res.writeHead(200);
        return res.end();
      }
      if (req.url !== "/v2/pipeline") {
        res.writeHead(404);
        return res.end();
      }
      const results: unknown[] = [];
      for (const request of JSON.parse(body).requests as { type: string; stmt?: Stmt; batch?: { steps: { stmt: Stmt; condition?: Cond }[] } }[]) {
        try {
          if (request.type === "execute") {
            requests.push(request.stmt!.sql);
            results.push({ type: "ok", response: { type: "execute", result: exec(request.stmt!) } });
          } else if (request.type === "batch") {
            const ok: boolean[] = [];
            const errors: unknown[] = [];
            const stepResults: unknown[] = [];
            request.batch!.steps.forEach((step, i) => {
              if (!holds(step.condition, ok, errors)) {
                ok[i] = false;
                errors[i] = null;
                stepResults[i] = null;
                return;
              }
              try {
                requests.push(step.stmt.sql);
                stepResults[i] = exec(step.stmt);
                ok[i] = true;
                errors[i] = null;
              } catch (e) {
                ok[i] = false;
                errors[i] = { message: (e as Error).message, code: "SQLITE_ERROR" };
                stepResults[i] = null;
              }
            });
            results.push({ type: "ok", response: { type: "batch", result: { step_results: stepResults, step_errors: errors } } });
          } else if (request.type === "close") {
            results.push({ type: "ok", response: { type: "close" } });
          } else {
            results.push({ type: "error", error: { message: `unsupported request ${request.type}` } });
          }
        } catch (e) {
          results.push({ type: "error", error: { message: (e as Error).message, code: "SQLITE_ERROR" } });
        }
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ baton: null, base_url: null, results }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        db.close();
      }),
  };
}
