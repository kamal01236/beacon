// The Beacon agent.
//
// Conceptually this runs headless in the background (scheduled every N minutes
// and on events), reading Jira/TFS + git history + the knowledge base with
// sprint-by-sprint memory, and WRITING its findings to an agent store that the
// UI reads. In this prototype we derive the same findings deterministically from
// the seed data so the dashboard shows exactly what such an agent would produce.
//
// The agent never writes to the tracker on its own — it proposes next actions
// and, when it needs a human, raises an input request and re-asks each run until
// it is answered.

import {
  activeItems, memberById, updatesForItem, members, activeSprint,
} from "./data";
import { attentionScore } from "./priorityScore";
import { TODAY, sprintDay, daysFromToday } from "./demo";
import type { Member } from "./types";

export const AGENT_INTERVAL_MINS = 60;

// Statuses for which a daily update is expected (so silence is meaningful).
// Overdue is handled as its own signal; decisions / risks-under-watch /
// not-started items are never nagged for a daily update.
const EXPECTS_DAILY = new Set(["in_progress", "blocked", "spillover"]);

export type SignalKind =
  | "hidden-blocker"
  | "missing-update"
  | "help-needed"
  | "knowledge-needed"
  | "overdue"
  | "at-risk";

export interface NextAction {
  label: string;
  kind: "request-update" | "assign-helper" | "attach-kb" | "raise-blocker" | "create-task" | "reprioritize";
}

export interface AgentSignal {
  id: string;
  itemId: string;
  owner?: Member;
  kind: SignalKind;
  severity: "high" | "medium" | "low";
  summary: string;
  evidence: string[];
  source: string; // which connector(s) this was drawn from
  confidence: number;
  actions: NextAction[];
}

export interface AgentRequest {
  id: string;
  itemId: string;
  toMemberId: string;
  question: string;
  askedOnDay: number;
  reaskCount: number; // how many runs it has gone unanswered
  status: "open" | "answered" | "resolved";
}

export interface AgentRun {
  ranAt: string; // ISO-ish, frozen to the demo clock
  trigger: "schedule" | "event";
  intervalMins: number;
  itemsScanned: number;
  signalsFound: number;
  openRequests: number;
  scope: string[];
  memory: string;
}

function helperFor(owner: Member | undefined): Member | undefined {
  // the agent suggests a helper from history: someone with a blocker-busting
  // track record who isn't the owner.
  return members.find((m) => m.id !== owner?.id && m.badges.includes("blocker-buster"));
}

/** Derive the agent's signals for the active sprint. */
export function getSignals(): AgentSignal[] {
  const out: AgentSignal[] = [];
  const day = sprintDay(activeSprint.startDate);

  for (const item of activeItems()) {
    const owner = memberById(item.owner);
    const ups = updatesForItem(item.id);
    const score = attentionScore(item);
    const blockerSignal = ups.find((u) => u.blockerSignal);
    const latest = ups[ups.length - 1];
    const staleDays = latest ? day - latest.sprintDay : day;

    // 1. hidden blocker detected from update language
    if (blockerSignal) {
      const helper = helperFor(owner);
      out.push({
        id: `sig-${item.id}-hb`,
        itemId: item.id,
        owner,
        kind: "hidden-blocker",
        severity: "high",
        summary: `${item.id.toUpperCase()} shows blocker language in ${owner?.name.split(" ")[0] ?? "the owner"}'s day-${blockerSignal.sprintDay} update, before any blocked flag was set.`,
        evidence: [
          blockerSignal.blockerText ? `"${blockerSignal.blockerText}"` : blockerSignal.progressText,
          item.blocker ? `Blocker now open: ${item.blocker}` : "No blocked flag set in the tracker",
        ],
        source: "Jira updates · update-language model",
        confidence: 94,
        actions: [
          { label: "Raise blocker in Jira (preview)", kind: "raise-blocker" },
          helper ? { label: `Suggest ${helper.name.split(" ")[0]} as helper`, kind: "assign-helper" } : { label: "Suggest a helper", kind: "assign-helper" },
          { label: "Attach Stripe-webhooks runbook", kind: "attach-kb" },
        ],
      });
    } else if (item.blocker || item.status === "blocked") {
      // 2. known blocker that still needs someone to act
      const helper = helperFor(owner);
      out.push({
        id: `sig-${item.id}-help`,
        itemId: item.id,
        owner,
        kind: "help-needed",
        severity: "high",
        summary: `${item.id.toUpperCase()} is blocked and needs help to move.`,
        evidence: [item.blocker ?? "Status: blocked"],
        source: "Jira · git history · knowledge base",
        confidence: 88,
        actions: [
          helper ? { label: `Pair with ${helper.name.split(" ")[0]} (resolved a similar issue)`, kind: "assign-helper" } : { label: "Assign a helper", kind: "assign-helper" },
          { label: "Attach a reference from the KB", kind: "attach-kb" },
        ],
      });
    }

    // 3. missing / stale update against the daily cadence -> an INPUT REQUEST.
    // Only in-flight work that has been updated before and then went quiet is
    // expected to report daily — decisions, risks under watch and not-started
    // items are not nagged.
    if (EXPECTS_DAILY.has(item.status) && staleDays >= 2) {
      out.push({
        id: `sig-${item.id}-stale`,
        itemId: item.id,
        owner,
        kind: "missing-update",
        severity: "medium",
        summary: `${item.id.toUpperCase()} has had no update for ${staleDays} days — below the daily cadence.`,
        evidence: [latest ? `Last update: day ${latest.sprintDay}` : "No updates this sprint"],
        source: "Jira update cadence",
        confidence: 97,
        actions: [{ label: "Request an update from the owner", kind: "request-update" }],
      });
    }

    // 4. overdue with client impact
    if (item.status === "overdue") {
      out.push({
        id: `sig-${item.id}-od`,
        itemId: item.id,
        owner,
        kind: "overdue",
        severity: "high",
        summary: `${item.id.toUpperCase()} is overdue by ${-daysFromToday(item.dueDate)} days${item.clientImpact ? " with client impact" : ""}.`,
        evidence: [`Due ${item.dueDate}`],
        source: "Jira due dates",
        confidence: 99,
        actions: [{ label: "Reprioritize on the board", kind: "reprioritize" }],
      });
    }

    // 5. high attention but no explicit blocker -> at risk, worth a look
    if (score.value >= 70 && !blockerSignal && !item.blocker && item.status !== "overdue") {
      out.push({
        id: `sig-${item.id}-risk`,
        itemId: item.id,
        owner,
        kind: "at-risk",
        severity: "medium",
        summary: `${item.id.toUpperCase()} scores ${score.value} on attention and is trending toward trouble.`,
        evidence: score.reasons.map((r) => `${r.label} (${r.points >= 0 ? "+" : ""}${r.points})`),
        source: "attention model",
        confidence: 82,
        actions: [{ label: "Open the item", kind: "reprioritize" }],
      });
    }
  }

  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** The open input requests the agent is waiting on a human to answer. */
export function getRequests(): AgentRequest[] {
  const day = sprintDay(activeSprint.startDate);
  const reqs: AgentRequest[] = [];
  for (const item of activeItems()) {
    if (!item.owner) continue;
    const itemUpdates = updatesForItem(item.id);
    const last = itemUpdates[itemUpdates.length - 1];
    const stale = last ? day - last.sprintDay : day;

    if (EXPECTS_DAILY.has(item.status) && stale >= 2) {
      reqs.push({
        id: `req-${item.id}`,
        itemId: item.id,
        toMemberId: item.owner,
        question:
          item.status === "blocked" || item.blocker
            ? `What exactly is blocking ${item.id.toUpperCase()}, and what do you need to unblock it (a person, access, or a reference)?`
            : `${item.id.toUpperCase()} has no update for ${stale} days — what's the current status, and are you blocked?`,
        askedOnDay: day,
        reaskCount: stale - 1,
        status: "open",
      });
    }
  }
  return reqs;
}

export function getRun(): AgentRun {
  const signals = getSignals();
  const requests = getRequests();
  return {
    ranAt: `${TODAY} 09:00`,
    trigger: "schedule",
    intervalMins: AGENT_INTERVAL_MINS,
    itemsScanned: activeItems().length,
    signalsFound: signals.length,
    openRequests: requests.length,
    scope: ["Jira / Azure DevOps", "Git history", "Knowledge base", "Prior sprints"],
    memory: `${activeSprint.name} + 1 prior sprint in context`,
  };
}

export const SIGNAL_LABEL: Record<SignalKind, string> = {
  "hidden-blocker": "Hidden blocker",
  "missing-update": "Missing update",
  "help-needed": "Help needed",
  "knowledge-needed": "Knowledge needed",
  overdue: "Overdue",
  "at-risk": "At risk",
};
