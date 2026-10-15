// A no-database fallback for the event log and agent-run log.
//
// When DATABASE_URL is unset, the server persists the append-only event log and
// agent-run snapshots to JSON files under .data/ (gitignored) instead of
// Postgres. This lets the whole /api + agent path run with no Docker/Postgres —
// the base snapshot comes from the faked Jira (lib/server/jira.ts), decisions
// are written here, and the same reducer folds them into the World. Point
// DATABASE_URL at a real Postgres and store.ts uses that instead, with no other
// change.
//
// Two rules make this safe enough to trust with an audit log:
//
//   ATOMIC WRITES — every write goes to a temp file in the same directory and
//   is then renamed over the target. A crash (or a full disk) mid-write leaves
//   the previous complete file, never a half-written one.
//
//   NO SILENT LOSS — an unreadable file is NOT treated as "no events". It is
//   quarantined to .data/<name>.corrupt-<timestamp> and the loss is logged, so
//   the record can be recovered by hand. The old behaviour — parse error means
//   empty array — meant the next append would overwrite the whole log with a
//   single event.
//
// SERVER ONLY. Single-process, last-write-wins: fine for a local prototype,
// not for concurrent writers (that is what the Postgres path is for — see
// docs/PRODUCTION-READINESS.md).

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { BeaconEvent } from "../events";
import { log } from "./log";

const dir = join(process.cwd(), ".data");
const eventsFile = join(dir, "events.json");
const runsFile = join(dir, "runs.json");

function ensureDir() {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** Move an unreadable file aside so an append cannot overwrite it. */
function quarantine(file: string, reason: string): void {
  const to = `${file}.corrupt-${Date.now()}`;
  try {
    renameSync(file, to);
    log.error("store file was unreadable and has been quarantined", { file, movedTo: to, reason });
  } catch (err) {
    log.error("store file is unreadable and could not be quarantined", {
      file,
      reason,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

function readArr<T>(file: string): T[] {
  if (!existsSync(file)) return [];
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (err) {
    quarantine(file, `unreadable: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("expected a JSON array");
    return parsed as T[];
  } catch (err) {
    quarantine(file, `invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

/** Write via temp file + rename, so a reader never sees a partial file. */
function writeArr(file: string, arr: unknown[]) {
  ensureDir();
  const tmp = `${file}.tmp-${process.pid}`;
  try {
    writeFileSync(tmp, JSON.stringify(arr, null, 2));
    renameSync(tmp, file);
  } catch (err) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      // nothing more to do — the original file is still intact
    }
    throw err;
  }
}

export function loadEventsFile(): BeaconEvent[] {
  return readArr<BeaconEvent>(eventsFile);
}

export function appendEventFile(ev: BeaconEvent): void {
  writeArr(eventsFile, [...loadEventsFile(), ev]);
}

/** Erase the event log (the no-database twin of `DELETE FROM events`). */
export function clearEventsFile(): void {
  writeArr(eventsFile, []);
}

/** Drop events older than an ISO cutoff; returns how many went. The retention sweep. */
export function pruneEventsFile(cutoff: string): number {
  const all = loadEventsFile();
  const keep = all.filter((e) => e.at >= cutoff);
  if (keep.length !== all.length) writeArr(eventsFile, keep);
  return all.length - keep.length;
}

export interface RunRow {
  at: string;
  trigger: string;
  detector: string;
  provider: string | null;
  model: string | null;
  itemsScanned: number;
  signalsOpen: number;
  summary: unknown;
}

/**
 * How many run snapshots the file store keeps. Each one holds the full
 * signals/requests snapshot, so without a cap a worker running every hour grows
 * this file without bound. Postgres keeps every row (that is what the retention
 * policy is for); the file fallback keeps a window.
 */
export const MAX_RUN_ROWS = 50;

export function appendRunFile(row: RunRow): void {
  writeArr(runsFile, [...readArr<RunRow>(runsFile), row].slice(-MAX_RUN_ROWS));
}

export function loadRunsFile(): RunRow[] {
  return readArr<RunRow>(runsFile);
}
