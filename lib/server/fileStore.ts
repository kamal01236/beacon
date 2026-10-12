// A no-database fallback for the event log and agent-run log.
//
// When DATABASE_URL is unset, the server persists the append-only event log and
// agent-run snapshots to JSON files under .data/ (gitignored) instead of
// Postgres. This lets the whole /api + agent path run on a plain `npm run dev`
// with no Docker/Postgres — the base snapshot comes from the faked Jira
// (lib/server/jira.ts), decisions are written here, and the same reducer folds
// them into the World. Point DATABASE_URL at a real Postgres and store.ts uses
// that instead, with no other change.
//
// SERVER ONLY. Single-process, last-write-wins — fine for a local prototype,
// not for concurrent writers (that is what the Postgres path is for).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { BeaconEvent } from "../events";

const dir = join(process.cwd(), ".data");
const eventsFile = join(dir, "events.json");
const runsFile = join(dir, "runs.json");

function ensureDir() {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}
function readArr<T>(file: string): T[] {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T[];
  } catch {
    return [];
  }
}
function writeArr(file: string, arr: unknown[]) {
  ensureDir();
  writeFileSync(file, JSON.stringify(arr, null, 2));
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

export function appendRunFile(row: RunRow): void {
  writeArr(runsFile, [...readArr<RunRow>(runsFile), row]);
}

export function loadRunsFile(): RunRow[] {
  return readArr<RunRow>(runsFile);
}
