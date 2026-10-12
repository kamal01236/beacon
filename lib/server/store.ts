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
import { loadEventsFile, appendEventFile, appendRunFile, type RunRow } from "./fileStore";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let seq = 0;

// Which backend is live, resolved once per process. If DATABASE_URL is set we
// probe Postgres; if it is unreachable we fall back to the faked Jira + .data/
// file store for the rest of the process instead of erroring — so the stack
// comes up whether or not a database happens to be running.
let dbResolved: boolean | null = null;
async function usingDb(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;
  if (dbResolved !== null) return dbResolved;
  try {
    const { db } = await import("./db");
    await db().query("SELECT 1");
    dbResolved = true;
  } catch {
    console.warn("[beacon] DATABASE_URL is set but Postgres is unreachable — using the faked Jira + .data/ file store.");
    dbResolved = false;
  }
  return dbResolved;
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
    } catch {
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
