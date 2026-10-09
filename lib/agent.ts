// The Beacon agent.
//
// Conceptually it runs headless (every N minutes and on tracker events) over the
// tracker, git history and the knowledge base. In this prototype it runs over the
// predefined seed + the decisions people record in the session, and derives
// everything with transparent rules — the same signals, requests and proposals
// the live agent would write to its store.
//
// Human in control, by construction:
//   - a SIGNAL is an assessment; people accept, dismiss (with a reason) or snooze it
//   - a PROPOSAL is a tracker change; it is only a preview until a human approves it
//   - a REQUEST asks one person a question; update-language concerns go to the
//     AUTHOR first, before anyone else is asked to act on them
//   - confidence is computed and shown with its basis, and is recalibrated by the
//     team's own accept/dismiss record

import kbJson from "@/data/kb.json";
import { activeItems, memberById, members, firstName, code, SEED, type World } from "./data";
import { factsFor, type ItemFacts } from "./facts";
import { attentionScore, ATTENTION_THRESHOLD } from "./priorityScore";
import { TODAY, todayDay } from "./demo";
import { effective, type Change, type SignalDecision } from "./events";
import type { Item, Member } from "./types";

export const AGENT_INTERVAL_MINS = 60;

// ---- knowledge base + helper suggestion ----------------------------------

export interface KbArticle {
  id: string;
  title: string;
  author: string;
  tags: string[];
  summary: string;
  steps: string[];
}
export const KB = kbJson as KbArticle[];

export interface KbMatch {
  article: KbArticle;
  matched: string[];
}

function itemText(item: Item, f: ItemFacts): string {
  const recent = f.languageNow?.update ?? f.firstDistress?.update;
  return [item.title, item.description, item.blocker, recent?.progressText, recent?.blockerText]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Best runbook for an item: tag overlap with its title, blocker and update wording (needs 2+ tags). */
export function kbFor(item: Item, w: World = SEED): KbMatch | null {
  const text = itemText(item, factsFor(item, w));
  let best: KbMatch | null = null;
  for (const article of KB) {
    const matched = article.tags.filter((t) => text.includes(t));
    if (matched.length >= 2 && (!best || matched.length > best.matched.length)) best = { article, matched };
  }
  return best;
}

export interface Helper {
  member: Member;
  why: string;
  alreadyPairing: boolean;
}

/** Who could help: the matching runbook's author, else a teammate with a blocker-busting record and the lightest load. */
export function helperFor(item: Item, w: World = SEED): Helper | undefined {
  const f = factsFor(item, w);
  const kb = kbFor(item, w);
  const latest = (f.languageNow?.update ?? f.firstDistress?.update)?.progressText ?? "";
  const lastText = [...w.updates].reverse().find((u) => u.itemId === item.id && u.progressText)?.progressText ?? latest;
  const pairing = (m: Member) => lastText.includes(m.name.split(" ")[0]);

  if (kb && kb.article.author !== item.owner) {
    const m = memberById(kb.article.author)!;
    return { member: m, why: `wrote the "${kb.article.title}" runbook`, alreadyPairing: pairing(m) };
  }
  const load = (m: Member) => activeItems(w).filter((i) => i.owner === m.id && (i.status === "in_progress" || i.status === "blocked")).length;
  const m = members
    .filter((x) => x.id !== item.owner && x.badges.includes("blocker-buster"))
    .sort((a, b) => load(a) - load(b))[0];
  return m ? { member: m, why: `blocker-buster record · ${load(m)} item(s) in flight`, alreadyPairing: pairing(m) } : undefined;
}

// ---- confidence ----------------------------------------------------------

export interface Confidence {
  kind: "fact" | "inferred";
  value: number; // 0..100
  basis: { label: string; points: number }[]; // value == sum of basis points (clamped)
}

export type SignalKind =
  | "hidden-blocker"
  | "blocked"
  | "cannot-deliver"
  | "missing-update"
  | "overdue"
  | "stale-status"
  | "at-risk";

export const SIGNAL_LABEL: Record<SignalKind, string> = {
  "hidden-blocker": "Hidden blocker",
  blocked: "Blocked — needs help",
  "cannot-deliver": "Cannot deliver",
  "missing-update": "Missing update",
  overdue: "Overdue",
  "stale-status": "Status out of date",
  "at-risk": "At risk",
};

/** The team's accept/dismiss record for one kind of signal. */
export function feedbackFor(kind: SignalKind, w: World) {
  const ds = effective(w.events).filter((e) => e.kind === "signal.decided" && e.signalKind === kind) as { decision: SignalDecision }[];
  const accepted = ds.filter((d) => d.decision === "accepted").length;
  const dismissed = ds.filter((d) => d.decision === "dismissed").length;
  return { accepted, dismissed, decided: accepted + dismissed };
}

const MIN_FEEDBACK = 3;

function calibrate(kind: SignalKind, raw: Confidence["basis"], w: World): Confidence {
  const basis = [...raw];
  const prior = Math.max(5, Math.min(95, basis.reduce((a, b) => a + b.points, 0)));
  let value = prior;
  const fb = feedbackFor(kind, w);
  if (fb.decided >= MIN_FEEDBACK) {
    const observed = Math.round((100 * fb.accepted) / fb.decided);
    value = Math.round((prior + observed) / 2);
    basis.push({ label: `Team feedback: ${fb.accepted} of ${fb.decided} accepted (${observed}%)`, points: value - prior });
  }
  return { kind: "inferred", value, basis };
}

const FACT = (source: string): Confidence => ({ kind: "fact", value: 100, basis: [{ label: `Read directly from ${source}`, points: 100 }] });

// ---- signals + proposals -------------------------------------------------

export interface Proposal {
  id: string;
  itemId: string;
  origin: string; // "signal:<kind>" or "request:<kind>"
  change: Change;
  state: "pending" | "approved" | "rejected";
  decidedBy?: string;
}

export interface AgentSignal {
  id: string;
  itemId: string;
  owner?: Member;
  kind: SignalKind;
  severity: "high" | "medium" | "low";
  summary: string;
  evidence: string[];
  source: string;
  confidence: Confidence;
  proposals: Proposal[];
  kb?: KbMatch | null;
  helper?: Helper;
  authorFirst?: string; // member id asked to confirm before anyone acts
  state: "open" | SignalDecision;
  decidedBy?: string;
  reason?: string;
}

function decisionOf(id: string, w: World) {
  const ds = effective(w.events).filter((e) => e.kind === "signal.decided" && e.signalId === id);
  const last = ds[ds.length - 1] as { decision: SignalDecision; actor: string; reason?: string } | undefined;
  return last ? { state: last.decision, decidedBy: last.actor, reason: last.reason } : { state: "open" as const };
}

export function proposal(id: string, itemId: string, origin: string, change: Change, w: World): Proposal {
  const ds = effective(w.events).filter((e) => e.kind === "proposal.decided" && e.proposalId === id);
  const last = ds[ds.length - 1] as { decision: "approved" | "rejected"; actor: string } | undefined;
  return { id, itemId, origin, change, state: last ? last.decision : "pending", decidedBy: last?.actor };
}

const quote = (s: string, n = 110) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

export function getSignals(w: World = SEED): AgentSignal[] {
  const out: AgentSignal[] = [];
  const today = todayDay();

  const push = (s: Omit<AgentSignal, "state" | "decidedBy" | "reason">) => out.push({ ...s, ...decisionOf(s.id, w) });

  for (const item of activeItems(w)) {
    const f = factsFor(item, w);
    if (f.done) continue;
    const owner = memberById(item.owner);
    const score = attentionScore(item, w);
    const id = (k: string) => `sig-${item.id}-${k}`;
    let explained = false;

    // 1. update language reads as blocked, but nobody raised a blocker
    if (f.languageNow && !f.blocked) {
      explained = true;
      const L = f.languageNow;
      const kb = kbFor(item, w);
      const helper = helperFor(item, w);
      const sid = id("hidden");
      push({
        id: sid, itemId: item.id, owner, kind: "hidden-blocker", severity: "high",
        summary: `${code(item)} — ${firstName(L.update.author)}'s day-${L.day} update reads as blocked, but no blocker is raised.`,
        evidence: [
          `"${quote(L.update.progressText ?? "")}"`,
          `Phrases: ${L.detection.hits.map((h) => `${h.phrase} (+${h.weight})`).join(", ")}${L.detection.relief.length ? `; offset by ${L.detection.relief.map((h) => `${h.phrase} (${h.weight})`).join(", ")}` : ""}`,
          `Tracker status: ${item.status.replace("_", " ")} — no blocked flag`,
        ],
        source: "Update language (rule-based detector)",
        confidence: calibrate("hidden-blocker", [
          { label: "Detector baseline", points: 40 },
          { label: `Language match strength ${L.detection.score} × 6`, points: 6 * L.detection.score },
          ...(f.missedDays.some((d) => d > L.day) ? [{ label: "Updates missed after it", points: 10 }] : []),
        ], w),
        proposals: [
          proposal(`${sid}:raise`, item.id, "signal:hidden-blocker", {
            field: "blocker", status: "blocked", from: item.status,
            label: `Status: ${item.status.replace("_", " ")} → Blocked, with a blocker note`,
            to: `"${quote(L.update.progressText ?? "", 140)}" — ${firstName(L.update.author)}, day ${L.day}`,
          }, w),
          ...(helper && !helper.alreadyPairing ? [proposal(`${sid}:helper`, item.id, "signal:hidden-blocker", {
            field: "comment", label: `Comment: suggest ${helper.member.name.split(" ")[0]} as pairing partner`,
            to: `@${helper.member.name.split(" ")[0]} could you pair on this? You ${helper.why}.`,
          }, w)] : []),
          ...(kb ? [proposal(`${sid}:kb`, item.id, "signal:hidden-blocker", {
            field: "comment", label: `Comment: link runbook "${kb.article.title}"`, to: `Possibly relevant: ${kb.article.title} — ${kb.article.summary}`,
          }, w)] : []),
        ],
        kb, helper, authorFirst: L.update.author ?? undefined,
      });
    }

    // 2. formally blocked — help it move
    if (f.blocked) {
      explained = true;
      const kb = kbFor(item, w);
      const helper = helperFor(item, w);
      const sid = id("blocked");
      const lag = f.firstDistress && f.blockedSinceDay !== null ? f.blockedSinceDay - f.firstDistress.day : null;
      push({
        id: sid, itemId: item.id, owner, kind: "blocked", severity: "high",
        summary: `${code(item)} has been blocked for ${f.blockedDays} day(s)${f.dependents.length ? ` and ${f.dependents.length} item(s) wait on it` : ""}.`,
        evidence: [
          item.blocker ?? "Status: blocked",
          ...(lag && lag > 0 ? [`The wording read as blocked on day ${f.firstDistress!.day} — it was raised formally on day ${f.blockedSinceDay} (${lag} days later)`] : []),
          ...(helper?.alreadyPairing ? [`${helper.member.name.split(" ")[0]} is already pairing on it (latest update)`] : []),
        ],
        source: "Tracker status + blocker field",
        confidence: FACT("the tracker's status and blocker fields"),
        proposals: [
          ...(helper && !helper.alreadyPairing ? [proposal(`${sid}:helper`, item.id, "signal:blocked", {
            field: "comment", label: `Comment: ask ${helper.member.name.split(" ")[0]} to pair`, to: `@${helper.member.name.split(" ")[0]} could you pair on this blocker? You ${helper.why}.`,
          }, w)] : []),
          ...(kb ? [proposal(`${sid}:kb`, item.id, "signal:blocked", {
            field: "comment", label: `Comment: link runbook "${kb.article.title}"`, to: `Possibly relevant: ${kb.article.title} — ${kb.article.summary}`,
          }, w)] : []),
        ],
        kb, helper,
      });
    }

    // 3. it can't ship because something upstream is blocked (what Jira's roll-up hides)
    if (!f.blocked && f.blockedUpstream.length) {
      explained = true;
      const up = f.blockedUpstream.map(code).join(", ");
      const sid = id("upstream");
      push({
        id: sid, itemId: item.id, owner, kind: "cannot-deliver", severity: f.dueIn <= 2 ? "high" : "medium",
        summary: `${code(item)} shows "${item.status.replace("_", " ")}" but cannot deliver until ${up} unblocks.`,
        evidence: [`Depends on ${up}, which is blocked`, `Due ${item.dueDate}`],
        source: "Dependency graph",
        confidence: FACT("the dependency links and their statuses"),
        proposals: [proposal(`${sid}:link`, item.id, "signal:cannot-deliver", {
          field: "link", label: `Mark as "is blocked by ${up}"`, to: `is blocked by ${up}`,
        }, w)],
      });
    }

    // 4. in-flight work that went quiet — the agent asks the owner (see getRequests)
    if (f.expectsDaily && f.staleDays >= 2) {
      push({
        id: id("quiet"), itemId: item.id, owner, kind: "missing-update", severity: "medium",
        summary: `${code(item)} has had no update for ${f.staleDays} days — below the daily cadence.`,
        evidence: [f.lastUpdateDay === null ? "No update posted this sprint" : `Last update: day ${f.lastUpdateDay}`, `${firstName(item.owner)} has been asked for an update`],
        source: "Update cadence",
        confidence: FACT("update timestamps"),
        proposals: [],
      });
    }

    // 5. past due
    if (f.overdueDays > 0) {
      explained = true;
      const statusSaysOverdue = item.status === "overdue";
      const sid = id(statusSaysOverdue ? "overdue" : "stale");
      push({
        id: sid, itemId: item.id, owner,
        kind: statusSaysOverdue ? "overdue" : "stale-status",
        severity: statusSaysOverdue ? "high" : item.clientImpact || item.priority === "high" ? "medium" : "low",
        summary: statusSaysOverdue
          ? `${code(item)} is overdue by ${f.overdueDays} day(s)${item.clientImpact ? " with client impact" : ""}.`
          : `${code(item)} is ${f.overdueDays} day(s) past due but still says "${item.status.replace("_", " ")}".`,
        evidence: [`Due ${item.dueDate}`, ...(f.lastUpdateDay !== null ? [`Last update day ${f.lastUpdateDay}`] : [])],
        source: "Due date",
        confidence: FACT("the due date"),
        proposals: [proposal(`${sid}:ask`, item.id, `signal:${statusSaysOverdue ? "overdue" : "stale-status"}`, {
          field: "comment",
          label: `Comment: ask ${firstName(item.owner)} for a new date or status`,
          to: `@${firstName(item.owner)} this is ${f.overdueDays} day(s) past due — is it done, or what is the new date?`,
        }, w)],
      });
    }

    // 6. high attention with no single explanation above — a prediction, so inferred
    if (!explained && score.value >= ATTENTION_THRESHOLD) {
      const drivers = score.reasons.filter((r) => r.warn);
      push({
        id: id("risk"), itemId: item.id, owner, kind: "at-risk", severity: "medium",
        summary: `${code(item)} scores ${score.value} on attention and is trending toward trouble.`,
        evidence: score.reasons.map((r) => `${r.label} (${r.points >= 0 ? "+" : ""}${r.points})`),
        source: "Attention score",
        confidence: calibrate("at-risk", [
          { label: "Prediction baseline", points: 35 },
          { label: `${drivers.length} independent warning driver(s) × 10`, points: 10 * drivers.length },
        ], w),
        proposals: [],
      });
    }
  }

  const rank = { high: 0, medium: 1, low: 2 };
  const kindRank: Record<SignalKind, number> = { "hidden-blocker": 0, blocked: 1, "cannot-deliver": 2, overdue: 3, "stale-status": 4, "missing-update": 5, "at-risk": 6 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || kindRank[a.kind] - kindRank[b.kind]);
}

// ---- input requests (the agent asks a human) -----------------------------

export interface AgentRequest {
  id: string;
  itemId: string;
  toMemberId: string;
  kind: "update" | "confirm-blocker";
  question: string;
  sinceDay: number; // first run that asked
  asks: number; // daily runs it has been asked at, including today
  signalId?: string;
  raise?: Proposal; // for confirm-blocker: the change "Yes" approves
}

export function getRequests(w: World = SEED): AgentRequest[] {
  const today = todayDay();
  const signals = getSignals(w);
  const reqs: AgentRequest[] = [];
  for (const item of activeItems(w)) {
    const f = factsFor(item, w);
    if (f.done) continue;

    // author-first: language concerns go to the person who wrote the update
    const hidden = signals.find((s) => s.itemId === item.id && s.kind === "hidden-blocker" && s.state === "open");
    if (hidden && f.languageNow?.update.author) {
      const L = f.languageNow;
      reqs.push({
        id: `ask-${item.id}-confirm`, itemId: item.id, toMemberId: L.update.author!, kind: "confirm-blocker",
        question: `Your day-${L.day} update on ${code(item)} says "${quote(L.update.progressText ?? "", 90)}". Are you blocked? If yes, Beacon raises it in the tracker; if not, it drops the concern.`,
        sinceDay: L.day, asks: today - L.day + 1, signalId: hidden.id,
        raise: hidden.proposals.find((p) => p.id.endsWith(":raise")),
      });
    }

    if (item.owner && f.expectsDaily && f.staleDays >= 2) {
      const since = (f.lastUpdateDay ?? 0) + 2;
      reqs.push({
        id: `ask-${item.id}-update`, itemId: item.id, toMemberId: item.owner, kind: "update",
        question: f.blocked
          ? `What exactly is blocking ${code(item)}, and what do you need to unblock it (a person, access, or a reference)?`
          : `${code(item)} has had no update for ${f.staleDays} days — what's the status, and are you blocked?`,
        sinceDay: since, asks: today - since + 1,
      });
    }
  }
  return reqs;
}

// ---- the run summary + detection history ----------------------------------

export interface AgentRun {
  ranAt: string;
  trigger: "schedule" | "event";
  intervalMins: number;
  itemsScanned: number;
  signalsOpen: number;
  signalsDecided: number;
  openRequests: number;
  pendingProposals: number;
  scope: string[];
  memory: string;
}

export function getRun(w: World = SEED): AgentRun {
  const signals = getSignals(w);
  const sessionActivity = effective(w.events).length > 0;
  return {
    ranAt: `${TODAY} 09:00`,
    trigger: sessionActivity ? "event" : "schedule",
    intervalMins: AGENT_INTERVAL_MINS,
    itemsScanned: activeItems(w).length,
    signalsOpen: signals.filter((s) => s.state === "open").length,
    signalsDecided: signals.filter((s) => s.state !== "open").length,
    openRequests: getRequests(w).length,
    pendingProposals: signals
      .filter((s) => s.state === "open" || s.state === "accepted")
      .flatMap((s) => s.proposals)
      .filter((p) => p.state === "pending").length,
    scope: ["Tracker items (seed)", "Stand-up updates", "Knowledge base", "Sprint 1 history"],
    memory: "Sprint 2 + Sprint 1 history in context",
  };
}

export interface DetectionRecord {
  item: Item;
  day: number;
  author: string | null;
  phrases: string[];
  raisedDay: number | null; // when a blocker was formally raised (null = never)
  leadDays: number | null; // how much earlier the language showed it
}

/** Every active item whose update wording read as blocked this sprint, vs when it was formally raised. */
export function detections(w: World = SEED): DetectionRecord[] {
  return activeItems(w)
    .map((item) => ({ item, f: factsFor(item, w) }))
    .filter(({ f }) => f.firstDistress)
    .map(({ item, f }) => ({
      item,
      day: f.firstDistress!.day,
      author: f.firstDistress!.update.author,
      phrases: f.firstDistress!.detection.hits.map((h) => h.phrase),
      raisedDay: f.blockedSinceDay,
      leadDays: f.blockedSinceDay !== null ? f.blockedSinceDay - f.firstDistress!.day : null,
    }))
    .sort((a, b) => a.day - b.day);
}
