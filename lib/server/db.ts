// A single Postgres connection pool for the whole server process.
//
// SERVER ONLY. Nothing in the browser bundle imports this file — it is used by
// the API route handlers (app/api/**) and the agent worker (agent/run.mjs),
// neither of which ships to the client. DATABASE_URL comes from .env.local on
// WSL (see .env.example); it never appears in client code.

import { Pool } from "pg";

declare global {
  // Reuse the pool across hot-reloads in dev so we don't exhaust connections.
  // eslint-disable-next-line no-var
  var __beaconPool: Pool | undefined;
}

export function db(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set — copy .env.example to .env.local and point it at your Postgres (see BACKEND-PLAN.md §7).");
  }
  if (!global.__beaconPool) {
    global.__beaconPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  }
  return global.__beaconPool;
}
