// A single Postgres connection pool for the whole server process.
//
// SERVER ONLY. Nothing in the browser bundle imports this file — it is used by
// the API route handlers (app/api/**) and the agent worker, neither of which
// ships to the client. DATABASE_URL comes from .env.local (see .env.example);
// it never appears in client code and is redacted from logs (lib/server/log.ts).
//
// Three things here are about staying up rather than connecting:
//   • an 'error' listener — a pooled client that dies while idle (a database
//     restart, a dropped network) emits 'error' on the Pool. With no listener,
//     Node treats it as an unhandled error event and takes the process down.
//   • bounded waits — connectionTimeoutMillis and statement_timeout mean a
//     database that is unreachable or stuck fails the request instead of
//     holding it, which is what `usingDb()` in store.ts needs to fall back.
//   • idle reaping — idleTimeoutMillis returns connections so a quiet process
//     does not sit on the database's connection budget.

import { Pool } from "pg";
import { log } from "./log";

declare global {
  // Reuse the pool across hot-reloads in dev so we do not exhaust connections.
  // eslint-disable-next-line no-var
  var __beaconPool: Pool | undefined;
}

const num = (raw: string | undefined, fallback: number): number => {
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function db(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set — copy .env.example to .env.local and point it at your Postgres (see docs/OPERATIONS.md).",
    );
  }
  if (!global.__beaconPool) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: num(process.env.BEACON_DB_POOL_MAX, 10),
      connectionTimeoutMillis: num(process.env.BEACON_DB_CONNECT_TIMEOUT_MS, 5_000),
      idleTimeoutMillis: num(process.env.BEACON_DB_IDLE_TIMEOUT_MS, 30_000),
      // Bound every statement server-side as well, so one pathological query
      // cannot pin a connection for the life of the process.
      statement_timeout: num(process.env.BEACON_DB_STATEMENT_TIMEOUT_MS, 10_000),
    });
    // Without this listener an idle-client error is an unhandled 'error' event,
    // which ends the process. The pool discards the client itself; we only need
    // to record it.
    pool.on("error", (err) => log.error("postgres pool error (idle client discarded)", { err: err.message }));
    global.__beaconPool = pool;
  }
  return global.__beaconPool;
}

/** True when a pool exists — lets callers avoid creating one just to check. */
export const hasPool = (): boolean => !!global.__beaconPool;

/** Close the pool on shutdown so in-flight queries finish and sockets close. */
export async function closePool(): Promise<void> {
  const pool = global.__beaconPool;
  if (!pool) return;
  global.__beaconPool = undefined;
  try {
    await pool.end();
  } catch (err) {
    log.warn("closing the postgres pool failed", { err: err instanceof Error ? err.message : String(err) });
  }
}
