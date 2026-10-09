// Per-item facts, derived once per world: dates, cadence, blocker timeline,
// update language and the dependency graph. The attention score, the agent's
// signals and the roll-ups all read these, so they can never disagree.

import { activeItems, isDone, updatesForItem, type World } from "./data";
import { daysFromToday, sprintDay, todayDay, ACTIVE_SPRINT_START } from "./demo";
import { detect, type Detection } from "./detect";
import type { Item, Update } from "./types";

// Statuses for which a daily update is expected (so silence is meaningful).
// Decisions, risks under watch and not-started items are never nagged.
export const EXPECTS_DAILY = new Set(["in_progress", "blocked", "spillover"]);

export interface LanguageHit {
  day: number;
  update: Update;
  detection: Detection;
}

export interface ItemFacts {
  item: Item;
  done: boolean;
  dueIn: number; // whole days until due (negative = past due)
  overdueDays: number; // > 0 only when past due and not done
  lastUpdateDay: number | null; // last update a person actually posted
  staleDays: number; // days since that update (or since sprint start)
  expectsDaily: boolean;
  missedDays: number[]; // days the tracker recorded a missing update
  blocked: boolean;
  blockedSinceDay: number | null; // when it was formally raised
  blockedDays: number;
  languageNow: LanguageHit | null; // the latest update reads as blocked
  firstDistress: LanguageHit | null; // first update this sprint that read as blocked
  dependents: Item[]; // open active items that depend on this one
  waitingOn: Item[]; // unfinished items this one depends on
  blockedUpstream: Item[]; // anything upstream (transitively) that is blocked
  ownerBlockedOn: Item[]; // other items of the same owner that are blocked
}

const cache = new WeakMap<World, Map<string, ItemFacts>>();

const isBlocked = (i: Item) => i.status === "blocked" || (!!i.blocker && !isDone(i));
const textOf = (u: Update) => [u.progressText, u.blockerText].filter(Boolean).join(" ");

export function factsFor(item: Item, w: World): ItemFacts {
  let m = cache.get(w);
  if (!m) cache.set(w, (m = new Map()));
  const hit = m.get(item.id);
  if (hit) return hit;

  const today = todayDay();
  const done = isDone(item);
  const ups = updatesForItem(item.id, w);
  const authored = ups.filter((u) => u.author && u.progressText);
  const last = authored[authored.length - 1];
  const lastUpdateDay = last ? last.sprintDay : null;
  const dueIn = daysFromToday(item.dueDate);
  const blocked = isBlocked(item);

  let blockedSinceDay: number | null = null;
  if (blocked) {
    const firstBlockedUpdate = ups.find((u) => u.statusStructured === "blocked");
    blockedSinceDay = item.blockerRaisedDate
      ? sprintDay(ACTIVE_SPRINT_START, item.blockerRaisedDate)
      : firstBlockedUpdate?.sprintDay ?? today;
  }

  const lang = authored.map((u) => ({ day: u.sprintDay, update: u, detection: detect(textOf(u)) }));
  const latestLang = lang[lang.length - 1];

  const all = w.items;
  const byId = new Map(all.map((i) => [i.id, i]));
  const upstream: Item[] = [];
  const seen = new Set<string>();
  const walk = (id: string) => {
    for (const d of byId.get(id)?.dependsOn ?? []) {
      if (seen.has(d)) continue;
      seen.add(d);
      const dep = byId.get(d);
      if (dep && isBlocked(dep)) upstream.push(dep);
      walk(d);
    }
  };
  walk(item.id);

  const active = activeItems(w);
  const f: ItemFacts = {
    item,
    done,
    dueIn,
    overdueDays: !done && dueIn < 0 ? -dueIn : 0,
    lastUpdateDay,
    staleDays: lastUpdateDay === null ? today - 1 : today - lastUpdateDay,
    expectsDaily: EXPECTS_DAILY.has(item.status),
    missedDays: ups.filter((u) => u.statusStructured === "missing" || (!u.author && !u.progressText)).map((u) => u.sprintDay),
    blocked,
    blockedSinceDay,
    blockedDays: blockedSinceDay === null ? 0 : today - blockedSinceDay,
    languageNow: latestLang && latestLang.detection.signal ? latestLang : null,
    firstDistress: lang.find((l) => l.detection.signal) ?? null,
    dependents: active.filter((i) => i.dependsOn.includes(item.id) && !isDone(i)),
    waitingOn: item.dependsOn.map((d) => byId.get(d)).filter((d): d is Item => !!d && !isDone(d)),
    blockedUpstream: upstream,
    ownerBlockedOn: item.owner ? active.filter((i) => i.owner === item.owner && i.id !== item.id && isBlocked(i)) : [],
  };
  m.set(item.id, f);
  return f;
}
