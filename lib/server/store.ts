// Reading and writing the world, with or without a database.
//
// There are two backends, chosen by DATABASE_URL:
//   • set   → Postgres: base snapshot from the items/updates tables, events and
//             runs in their tables (production-shaped, concurrent-safe).
//   • unset → no database: base snapshot from the FAKED Jira API (jira.ts, read
//             from data/*.json), events and runs in .data/*.json (fileStore.ts).
// Either way the SAME reducer the browser uses (buildWorldFrom) folds base +
// events into one World, so the server and client cannot disagree about what the
// board shows. appendEvent() is the single write path — the server twin of the
// browser's useActor().act() chokepoint.
//
// SERVER ONLY.

import { buildWorldFrom } from "../world";
import type { World } from "../data";
import type { BeaconEvent, Draft } from "../events";
import type { Item, Update } from "../types";
import type { KbArticle } from "../agent";
import { loadJiraBase } from "./jira";
import { loadEventsFile, appendEventFile, clearEventsFile, pruneEventsFile, loadRunsFile, appendRunFile, type RunRow } from "./fileStore";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { log } from "./log";

let seq = 0;

// Which backend is live. If DATABASE_URL is set we probe Postgres; if it is
// unreachable we fall back to the faked Jira + .data/ file store instead of
// erroring — so the stack comes up whether or not a database is running.
//
// The probe is RE-TRIED every RECHECK_MS while it is failing, so a server that
// started before its database does picks the database up on its own. It is
// never retried in the other direction: once Postgres has answered, this
// process stays on Postgres and a later failure surfaces as a 5xx rather than
// silently writing the team's next decisions to a different store, which would
// split the audit log across two backends.
interface Probe {
  usingDb: boolean;
  at: number;
  error: string | null;
}
let probe: Probe | null = null;
const RECHECK_MS = 60_000;

async function usingDb(now = Date.now()): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  if (probe && (probe.usingDb || now - probe.at < RECHECK_MS)) return probe.usingDb;
  try {
    const { db } = await import("./db");
    await db().query("SELECT 1");
    if (!probe?.usingDb) log.info("store backend: postgres");
    probe = { usingDb: true, at: now, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Log the downgrade once per probe cycle, not once per request.
    if (!probe || probe.error !== message) {
      log.warn("DATABASE_URL is set but Postgres is unreachable — using the faked Jira + .data/ file store", {
        err: message,
        retryInMs: RECHECK_MS,
      });
    }
    probe = { usingDb: false, at: now, error: message };
  }
  return probe.usingDb;
}

export interface StoreHealth {
  /** Which backend this process is reading and writing. */
  backend: "postgres" | "file";
  /** Whether a database was configured at all — a file backend with this true is a degraded state. */
  databaseUrlSet: boolean;
  lastProbeAt: string | null;
  /** Why the last probe failed, when it did. */
  error: string | null;
}

/** What /api/health reports about storage. Probes, so it is a real readiness check. */
export async function storeHealth(): Promise<StoreHealth> {
  const usingPostgres = await usingDb();
  return {
    backend: usingPostgres ? "postgres" : "file",
    databaseUrlSet: !!process.env.DATABASE_URL,
    lastProbeAt: probe ? new Date(probe.at).toISOString() : null,
    error: probe?.error ?? null,
  };
}

/** Test seam: forget the probe so the next call re-resolves the backend. */
export function resetStoreProbe(): void {
  probe = null;
}

export async function loadBase(): Promise<{ items: Item[]; updates: Update[] }> {
  if (!(await usingDb())) return loadJiraBase();
  const { db } = await import("./db");
  const pool = db();
  const [items, updates] = await Promise.all([
    pool.query<{ data: Item }>("SELECT data FROM items ORDER BY id"),
    pool.query<{ data: Update }>("SELECT data FROM updates ORDER BY id"),
  ]);
  return { items: items.rows.map((r) => r.data), updates: updates.rows.map((r) => r.data) };
}

export async function loadEvents(): Promise<BeaconEvent[]> {
  if (!(await usingDb())) return loadEventsFile();
  const { db } = await import("./db");
  const { rows } = await db().query<{ payload: BeaconEvent }>("SELECT payload FROM events ORDER BY at, id");
  return rows.map((r) => r.payload);
}

/**
 * The knowledge base. Without a database it is read straight from data/kb.json
 * (the same articles the pure brain bundles); with one it comes from the
 * knowledge_base table (ORDER BY embedding <-> query once that column is pgvector).
 */
export async function loadKb(): Promise<KbArticle[]> {
  if (!(await usingDb())) {
    try {
      return JSON.parse(readFileSync(join(process.cwd(), "data", "kb.json"), "utf8")) as KbArticle[];
    } catch (err) {
      // An empty KB degrades the "someone has solved this before" suggestion
      // rather than failing a run, but it is never normal — say so.
      log.warn("data/kb.json could not be read — blocker suggestions will have no articles to match", {
        err: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }
  const { db } = await import("./db");
  const { rows } = await db().query<{ data: KbArticle }>("SELECT data FROM knowledge_base ORDER BY id");
  return rows.map((r) => r.data);
}

/** base snapshot + events → the world every screen renders. */
export async function loadWorld(): Promise<World> {
  const [{ items, updates }, events] = await Promise.all([loadBase(), loadEvents()]);
  return buildWorldFrom(items, updates, events);
}

/** Append one decision to the log, filling in id + timestamp like the browser does. */
export async function appendEvent(draft: Draft, actor: string): Promise<BeaconEvent> {
  const ev = {
    ...draft,
    actor,
    id: `ev-${Date.now().toString(36)}-${(seq++).toString(36)}`,
    at: new Date().toISOString(),
  } as BeaconEvent;
  if (!(await usingDb())) {
    appendEventFile(ev);
    return ev;
  }
  const { db } = await import("./db");
  await db().query("INSERT INTO events (id, at, actor, kind, payload) VALUES ($1, $2, $3, $4, $5)", [
    ev.id,
    ev.at,
    ev.actor,
    ev.kind,
    ev,
  ]);
  return ev;
}

/**
 * Erase the whole human-decision log — the server twin of the browser's
 * resetInstance(). This is the demo-reset operator action, NOT how a person's
 * own data is erased (lib/policy.ts): the caller appends a `data.reset` event
 * afterwards so the emptied log still says who emptied it and when. Without
 * this the browser would clear only its own cache and the events would reappear
 * on the next page load.
 */
export async function clearEvents(): Promise<number> {
  const before = (await loadEvents()).length;
  if (!(await usingDb())) {
    clearEventsFile();
    return before;
  }
  const { db } = await import("./db");
  await db().query("DELETE FROM events");
  return before;
}

/**
 * The retention sweep: drop every event older than `cutoff` (ISO) and return
 * how many went. Unlike clearEvents this is the policy running on a schedule
 * rather than a person deleting a record — see lib/policy.ts.
 */
export async function pruneEvents(cutoff: string): Promise<number> {
  if (!(await usingDb())) return pruneEventsFile(cutoff);
  const { db } = await import("./db");
  const { rowCount } = await db().query("DELETE FROM events WHERE at < $1", [cutoff]);
  return rowCount ?? 0;
}

/**
 * The most recent agent-run snapshots, newest first. This is what the Agent
 * screen shows as "last run" when a backend is present — a real recorded run
 * rather than a nominal one derived from the frozen demo clock.
 */
export async function loadRuns(limit = 5): Promise<RunRow[]> {
  if (!(await usingDb())) return loadRunsFile().slice(-limit).reverse();
  const { db } = await import("./db");
  const { rows } = await db().query<RunRow & { items_scanned: number; signals_open: number }>(
    `SELECT at, trigger, detector, provider, model, items_scanned, signals_open, summary
       FROM agent_runs ORDER BY at DESC LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({
    at: typeof r.at === "string" ? r.at : new Date(r.at).toISOString(),
    trigger: r.trigger,
    detector: r.detector,
    provider: r.provider,
    model: r.model,
    itemsScanned: r.items_scanned,
    signalsOpen: r.signals_open,
    summary: r.summary,
  }));
}

/** Persist one agent-run snapshot (file or Postgres). */
export async function recordRun(row: Omit<RunRow, "at">): Promise<void> {
  if (!(await usingDb())) {
    appendRunFile({ at: new Date().toISOString(), ...row });
    return;
  }
  const { db } = await import("./db");
  await db().query(
    `INSERT INTO agent_runs (trigger, detector, provider, model, items_scanned, signals_open, summary)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [row.trigger, row.detector, row.provider, row.model, row.itemsScanned, row.signalsOpen, row.summary],
  );
}
