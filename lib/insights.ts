// Computed narratives: the delivery roll-up, the daily brief, blocker root
// causes, retro themes and adoption. Each sentence is assembled from facts —
// no hand-written story text — so it changes when the data or a decision does.

import { activeItems, members, code, isDone, SEED, type World } from "./data";
import { factsFor, EXPECTS_DAILY } from "./facts";
import { attentionScore, byAttention, ATTENTION_THRESHOLD } from "./priorityScore";
import { getRequests, getSignals, detections, feedbackFor, SIGNAL_LABEL, type SignalKind } from "./agent";
import { CAUSES, causesOf, detect, type CauseKey } from "./detect";
import { effective, DISMISS_REASONS } from "./events";
import { ACTIVE_SPRINT_ID, todayDay } from "./demo";
import type { Item } from "./types";

// ---- delivery roll-up -------------------------------------------------------

export interface RollupRow {
  item: Item;
  trackerSays: string; // the item's own status, as the tracker shows it
  beaconSays: "Blocked" | "Cannot deliver" | "At risk";
  because: string;
  blockedBy: Item[];
  waiting: Item[]; // open items that depend on it
}

/** Every open item whose real delivery state is worse than its own status shows. */
export function rollup(w: World = SEED): RollupRow[] {
  const rows: RollupRow[] = [];
  for (const item of activeItems(w)) {
    const f = factsFor(item, w);
    if (f.done) continue;
    const trackerSays = item.status.replace("_", " ");
    if (f.blocked) {
      rows.push({ item, trackerSays, beaconSays: "Blocked", because: item.blocker ?? "status is blocked", blockedBy: f.waitingOn, waiting: f.dependents });
    } else if (f.blockedUpstream.length) {
      rows.push({ item, trackerSays, beaconSays: "Cannot deliver", because: `waits on blocked ${f.blockedUpstream.map(code).join(", ")}`, blockedBy: f.blockedUpstream, waiting: f.dependents });
    } else if (f.languageNow) {
      rows.push({ item, trackerSays, beaconSays: "At risk", because: `day-${f.languageNow.day} update reads as blocked`, blockedBy: [], waiting: f.dependents });
    }
  }
  return rows.sort((a, b) => attentionScore(b.item, w).value - attentionScore(a.item, w).value);
}

// ---- participation --------------------------------------------------------

/**
 * Participation = of the people with in-flight work (an item that expects daily
 * updates), how many posted each day. People with nothing in flight aren't
 * expected to post, so they never count against the team. Placeholders the
 * tracker records for missed updates don't count as posts.
 */
export function participation(w: World = SEED) {
  const today = todayDay();
  const expected = new Set(activeItems(w).filter((i) => i.owner && EXPECTS_DAILY.has(i.status)).map((i) => i.owner!));
  const byDay = new Map<number, Set<string>>();
  for (const u of w.updates) {
    if (u.sprintId !== ACTIVE_SPRINT_ID || !u.author || !u.progressText || !expected.has(u.author)) continue;
    if (!byDay.has(u.sprintDay)) byDay.set(u.sprintDay, new Set());
    byDay.get(u.sprintDay)!.add(u.author);
  }
  const perDay = Array.from({ length: today }, (_, i) => byDay.get(i + 1)?.size ?? 0);
  const complete = perDay.slice(0, today - 1); // today is still in progress
  const rate = complete.length && expected.size ? complete.reduce((a, n) => a + n, 0) / (complete.length * expected.size) : 0;
  const fresh = new Set([...(byDay.get(today) ?? []), ...(byDay.get(today - 1) ?? [])]);
  return {
    perDay,
    expected: expected.size,
    rate,
    freshCount: fresh.size, // posted today or yesterday, ahead of today's stand-up
    quiet: members.filter((m) => expected.has(m.id) && !fresh.has(m.id)),
  };
}

// ---- the daily brief + headline --------------------------------------------

export interface Brief {
  tone: "bad" | "warn" | "ok";
  headline: string;
  detail: string;
  focus: Item | null;
  hotspots: Item[];
  lines: string[];
  basis: string;
}

export function brief(w: World = SEED): Brief {
  const items = activeItems(w);
  const ranked = byAttention(items, w);
  const hotspots = ranked.filter((i) => attentionScore(i, w).value >= ATTENTION_THRESHOLD);
  const rows = rollup(w);
  const p = participation(w);
  const requests = getRequests(w);
  const day = todayDay();

  const blocked = rows.filter((r) => r.beaconSays === "Blocked");
  const top = blocked.sort((a, b) => b.waiting.length - a.waiting.length)[0];
  const inherited = rows.filter((r) => r.beaconSays === "Cannot deliver");

  let tone: Brief["tone"] = "ok";
  let headline = "No deliverable is blocked right now.";
  let detail = `${hotspots.length} item(s) still need attention — the board shows why.`;
  let focus: Item | null = null;
  if (top) {
    const f = factsFor(top.item, w);
    tone = "bad";
    focus = top.item;
    headline = `${code(top.item)} ${top.item.title} cannot be delivered as things stand.`;
    const deps = inherited.filter((r) => r.blockedBy.some((b) => b.id === top.item.id)).map((r) => r.item);
    detail = [
      `Blocked for ${f.blockedDays} day(s): ${(top.item.blocker ?? "status is blocked").replace(/\.$/, "")}.`,
      deps.length ? `${deps.map((d) => `${code(d)} still shows "${d.status.replace("_", " ")}"`).join(", ")} but waits on it — the tracker's roll-up hides this.` : "",
      f.dueIn <= 0 ? "It is due today." : `Due in ${f.dueIn} day(s).`,
    ].filter(Boolean).join(" ");
  } else if (hotspots.length) {
    tone = "warn";
    focus = hotspots[0];
    headline = `${hotspots.length} item(s) need attention; nothing is blocked.`;
  }

  const lines: string[] = [];
  for (const it of hotspots.slice(0, 3)) {
    const s = attentionScore(it, w);
    const why = s.reasons.filter((r) => r.warn).slice(0, 2).map((r) => r.label);
    lines.push(`${code(it)} (${s.value}) — ${(why.length ? why : [s.reasons[0]?.label ?? ""]).join("; ")}`);
  }
  lines.push(`${p.freshCount} of ${p.expected} people with work in flight posted since yesterday${p.quiet.length ? ` — still quiet: ${p.quiet.map((m) => m.name.split(" ")[0]).join(", ")}` : ""}.`);
  if (requests.length) lines.push(`${requests.length} question(s) from the agent are waiting on an answer.`);

  return {
    tone, headline, detail, focus, hotspots, lines,
    basis: `Day ${day} · ${items.length} active items · ${w.updates.filter((u) => u.sprintId === ACTIVE_SPRINT_ID && u.author).length} updates · dependency links`,
  };
}

// ---- blocker root cause + retro themes ---------------------------------------

export interface CauseTheme {
  key: CauseKey;
  label: string;
  items: Item[];
  daysLost: number;
  evidence: string[];
  action: string;
}

/** Friction episodes this sprint (blocked, blocker language, overdue), grouped by cause from what people wrote. */
export function rootCauses(w: World = SEED): CauseTheme[] {
  const today = todayDay();
  const themes = new Map<CauseKey, CauseTheme>();
  const add = (key: CauseKey, item: Item, days: number, ev: string) => {
    const c = CAUSES.find((x) => x.key === key)!;
    const t = themes.get(key) ?? { key, label: c.label, items: [], daysLost: 0, evidence: [], action: c.action };
    if (!t.items.includes(item)) { t.items.push(item); t.daysLost += days; }
    if (!t.evidence.includes(ev)) t.evidence.push(ev);
    themes.set(key, t);
  };

  for (const item of activeItems(w)) {
    const f = factsFor(item, w);
    const episode = f.blocked || f.firstDistress || item.status === "overdue";
    if (!episode) continue;
    const start = f.firstDistress?.day ?? f.blockedSinceDay ?? today;
    const days = Math.max(0, today - start);
    // only what people wrote while it hurt: updates that read as blocked, plus the blocker itself
    const texts = [
      ...w.updates
        .filter((u) => u.itemId === item.id && u.progressText)
        .map((u) => ({ t: [u.progressText, u.blockerText].filter(Boolean).join(" "), d: u.sprintDay }))
        .filter(({ t }) => detect(t).signal),
      ...(item.blocker ? [{ t: item.blocker, d: f.blockedSinceDay ?? today }] : []),
    ];
    for (const { t, d } of texts) {
      for (const key of causesOf(t)) add(key, item, days, `${code(item)} day ${d}: "${t.length > 90 ? t.slice(0, 90).trimEnd() + "…" : t}"`);
    }
    if (item.type === "requirement" && item.clarityScore !== null && item.clarityScore <= 4) {
      add("requirements", item, days, `${code(item)} story clarity ${item.clarityScore}/10 when it entered the sprint`);
    }
  }
  return [...themes.values()].sort((a, b) => b.daysLost - a.daysLost || b.items.length - a.items.length);
}

export interface RetroTheme {
  id: string;
  title: string;
  evidence: string[];
  action: string;
}

export function retroThemes(w: World = SEED): RetroTheme[] {
  const out: RetroTheme[] = rootCauses(w).map((c) => ({
    id: `cause-${c.key}`,
    title: `${c.label}: ${c.items.length} item(s), ${c.daysLost} day(s) of friction`,
    evidence: c.evidence.slice(0, 3),
    action: c.action,
  }));

  const late = detections(w).filter((d) => d.leadDays && d.leadDays > 0);
  if (late.length) {
    out.push({
      id: "late-raise",
      title: "Blockers are raised later than they are felt",
      evidence: late.map((d) => `${code(d.item)}: wording read as blocked on day ${d.day}, raised on day ${d.raisedDay} (${d.leadDays} days later)`),
      action: "Treat Beacon's author-first prompt as the moment to raise a blocker, not the next stand-up.",
    });
  }

  const spill = activeItems(w).filter((i) => i.spillover && !isDone(i));
  if (spill.length) {
    const quiet = spill.filter((i) => factsFor(i, w).lastUpdateDay === null);
    out.push({
      id: "spillover",
      title: "Spillover carries silent risk",
      evidence: [`${spill.length} item(s) carried from last sprint (${spill.map(code).join(", ")})`, ...(quiet.length ? [`${quiet.length} of them had no update at all this sprint`] : [])],
      action: "Treat spillover as first-class work: re-plan it with an owner and a daily update in sprint planning.",
    });
  }
  return out;
}

// ---- adoption (team-level only) ---------------------------------------------

export function adoption(w: World = SEED) {
  const ev = effective(w.events);
  const signals = getSignals(w);
  const decided = ev.filter((e) => e.kind === "signal.decided") as Extract<typeof ev[number], { kind: "signal.decided" }>[];
  const proposals = ev.filter((e) => e.kind === "proposal.decided") as Extract<typeof ev[number], { kind: "proposal.decided" }>[];
  const feedback = ev.filter((e) => e.kind === "feedback.given") as Extract<typeof ev[number], { kind: "feedback.given" }>[];
  const posted = ev.filter((e) => e.kind === "update.posted") as Extract<typeof ev[number], { kind: "update.posted" }>[];

  const kinds = Object.keys(SIGNAL_LABEL) as SignalKind[];
  const byKind = kinds.map((k) => {
    const fb = feedbackFor(k, w);
    return {
      kind: k, label: SIGNAL_LABEL[k],
      raised: signals.filter((s) => s.kind === k).length,
      accepted: fb.accepted, dismissed: fb.dismissed,
      rate: fb.decided ? fb.accepted / fb.decided : null,
    };
  }).filter((r) => r.raised || r.accepted || r.dismissed);

  const accepted = decided.filter((d) => d.decision === "accepted").length;
  const dismissed = decided.filter((d) => d.decision === "dismissed").length;
  return {
    signalsRaised: signals.length,
    signalsOpen: signals.filter((s) => s.state === "open").length,
    accepted, dismissed,
    snoozed: decided.filter((d) => d.decision === "snoozed").length,
    acceptRate: accepted + dismissed ? accepted / (accepted + dismissed) : null,
    dismissReasons: DISMISS_REASONS.map((r) => ({ reason: r, count: decided.filter((d) => d.decision === "dismissed" && d.reason === r).length })),
    byKind,
    approved: proposals.filter((p) => p.decision === "approved").length,
    rejected: proposals.filter((p) => p.decision === "rejected").length,
    updatesPosted: posted.length,
    requestsAnswered: posted.filter((p) => p.requestId).length,
    helpful: feedback.filter((f) => f.helpful).length,
    notHelpful: feedback.filter((f) => !f.helpful).length,
    retroAdopted: ev.filter((e) => e.kind === "retro.adopted").length,
    totalEvents: ev.length,
  };
}

/** Sprint-level measured outcomes. Only what the data can show; recorded figures are labelled as such. */
export function measured(w: World = SEED) {
  const p = participation(w);
  const det = detections(w);
  const raisedLater = det.filter((d) => d.leadDays !== null && d.leadDays > 0);
  const avgLead = raisedLater.length ? raisedLater.reduce((a, d) => a + d.leadDays!, 0) / raisedLater.length : null;
  return { participationRate: p.rate, detections: det, avgLeadDays: avgLead, neverRaised: det.filter((d) => d.raisedDay === null) };
}

