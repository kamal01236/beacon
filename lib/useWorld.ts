"use client";

import { useMemo, useSyncExternalStore } from "react";
import { subscribe, getEvents, getServerEvents, record, type BeaconEvent, type Draft, type NewEvent } from "./events";
import { buildWorld } from "./world";
import { PERSONA, code, type World } from "./data";
import { SIGNAL_LABEL } from "./agent";
import { push } from "./toast";
import { useRole } from "@/components/RoleProvider";

/** The seed + this session's recorded decisions. Server render and first paint use the plain seed. */
export function useWorld(): World {
  const events = useSyncExternalStore(subscribe, getEvents, getServerEvents);
  return useMemo(() => buildWorld(events), [events]);
}

/** Every recorded event, including undone ones — for the activity log. */
export function useAllEvents() {
  return useSyncExternalStore(subscribe, getEvents, getServerEvents);
}

/** The receipt for a recorded decision: what happened, and whether it can be taken back. */
function receipt(e: BeaconEvent): { title: string; message?: string; tone?: "ok" | "warn" } | null {
  switch (e.kind) {
    case "update.posted":
      return {
        title: `Update posted on ${code(e.itemId)}`,
        message: e.requestId
          ? "The agent has its answer. Anything it reads as blocked comes back to you first."
          : "Your words are the record; the score re-ranks from them.",
      };
    case "signal.decided": {
      const label = SIGNAL_LABEL[e.signalKind as keyof typeof SIGNAL_LABEL] ?? e.signalKind;
      const verb = e.decision === "accepted" ? "Accepted" : e.decision === "dismissed" ? "Dismissed" : "Snoozed";
      return {
        title: `${verb}: ${label} on ${code(e.itemId)}`,
        message:
          e.decision === "dismissed"
            ? `Reason "${e.reason}" is counted against this rule's accept rate.`
            : e.decision === "snoozed"
              ? "It returns at the next daily run."
              : "Counted in this rule's accept rate, which feeds its confidence.",
        tone: e.decision === "dismissed" ? "warn" : "ok",
      };
    }
    case "proposal.decided":
      return e.decision === "approved"
        ? { title: `Approved: ${e.change.label}`, message: `In the tracker outbox for ${code(e.itemId)} — simulated in the prototype.`, tone: "ok" }
        : { title: `Rejected: ${e.change.label}`, message: "Nothing was sent to the tracker.", tone: "warn" };
    case "retro.adopted":
      return { title: "Retro action adopted", message: e.action, tone: "ok" };
    case "feedback.given":
      return { title: `Marked ${e.target} ${e.helpful ? "helpful" : "not helpful"}`, message: "Counted in adoption, per team — never per person." };
    case "event.undone":
      return null; // undoing already shows itself on screen
  }
}

/** Who is acting, and whether their role may record decisions (the manager view is read-only). */
export function useActor() {
  const { role } = useRole();
  const p = PERSONA[role];
  return {
    role,
    memberId: p.memberId,
    canAct: p.canAct,
    /**
     * The one place a decision becomes an event. Every recorded decision also
     * returns a receipt with undo attached, so the way back is never more than
     * one click away from where the person acted.
     */
    act: (e: Draft) => {
      if (!p.canAct) return null;
      const ev = record({ ...e, actor: p.memberId } as NewEvent);
      const r = receipt(ev);
      if (r) push({ ...r, undoId: ev.id, actor: ev.actor });
      return ev;
    },
  };
}
