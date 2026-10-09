"use client";

// Human-in-control controls — one implementation, used on every screen that
// lets a person act on what the agent found.

import Link from "next/link";
import { useState } from "react";
import { code, firstName, memberById, type World } from "@/lib/data";
import { SIGNAL_LABEL, type AgentRequest, type AgentSignal, type Confidence, type Proposal } from "@/lib/agent";
import { detect } from "@/lib/detect";
import { DISMISS_REASONS, effective, undo, type BeaconEvent } from "@/lib/events";
import { outbox } from "@/lib/world";
import { useActor } from "@/lib/useWorld";
import type { Item, ItemStatus } from "@/lib/types";

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function lastEvent(w: World, match: (e: BeaconEvent) => boolean): BeaconEvent | undefined {
  const es = effective(w.events).filter(match);
  return es[es.length - 1];
}

export function ReadOnlyNote() {
  const { canAct } = useActor();
  if (canAct) return null;
  return (
    <div className="banner warn" style={{ marginTop: 14 }}>
      <div className="bt"><b>Read-only view.</b> Managers see the same findings and decisions, but only the team records them.</div>
    </div>
  );
}

// ---- confidence -----------------------------------------------------------

export function ConfidenceBadge({ c }: { c: Confidence }) {
  if (c.kind === "fact") return <span className="conf fact" title="Read directly from tracker data — not a prediction">fact</span>;
  return <span className={`conf${c.value < 60 ? " low" : ""}`}>confidence {c.value}%</span>;
}

export function ConfidenceBasis({ c }: { c: Confidence }) {
  if (c.kind === "fact") return null;
  return (
    <details className="basis">
      <summary>How {c.value}% was computed</summary>
      <ul>
        {c.basis.map((b, i) => (
          <li key={i}>{b.label}: {b.points >= 0 ? "+" : ""}{b.points}</li>
        ))}
      </ul>
    </details>
  );
}

// ---- proposals (tracker changes) -------------------------------------------

export function ProposalRow({ p, w, signalId, signalKind }: { p: Proposal; w: World; signalId?: string; signalKind?: string }) {
  const { act, canAct } = useActor();
  const ev = lastEvent(w, (e) => e.kind === "proposal.decided" && e.proposalId === p.id);
  const decide = (decision: "approved" | "rejected") => {
    if (decision === "approved" && signalId && signalKind) {
      const s = lastEvent(w, (e) => e.kind === "signal.decided" && e.signalId === signalId);
      if (!s) act({ kind: "signal.decided", signalId, signalKind, itemId: p.itemId, decision: "accepted" });
    }
    act({ kind: "proposal.decided", proposalId: p.id, itemId: p.itemId, decision, change: p.change, origin: p.origin });
  };
  return (
    <div className="prop">
      <div className="pl">
        {p.change.label}
        <span className="pv">{p.change.field === "comment" ? `Comment on ${code(p.itemId)}: ${p.change.to}` : p.change.field === "link" ? `${code(p.itemId)} ${p.change.to}` : `${code(p.itemId)}: ${p.change.to}`}</span>
      </div>
      {p.state === "pending" ? (
        canAct && (
          <div className="btnrow">
            <button className="btn p sm" type="button" onClick={() => decide("approved")}>Approve</button>
            <button className="btn s sm" type="button" onClick={() => decide("rejected")}>Reject</button>
          </div>
        )
      ) : (
        <span className={p.state === "approved" ? "ok-note" : "no-note"}>
          {p.state === "approved" ? "Approved" : "Rejected"} by {firstName(p.decidedBy)}
          {p.state === "approved" && " · in outbox"}
          {canAct && ev && <> · <button className="link" type="button" onClick={() => undo(ev.id, ev.actor)}>undo</button></>}
        </span>
      )}
    </div>
  );
}

// ---- signals -----------------------------------------------------------------

export function SignalCard({ s, w }: { s: AgentSignal; w: World }) {
  const { act, canAct, memberId } = useActor();
  const [reason, setReason] = useState<string>(DISMISS_REASONS[0]);
  const ev = lastEvent(w, (e) => e.kind === "signal.decided" && e.signalId === s.id);
  const decided = s.state !== "open";
  const decide = (decision: "accepted" | "dismissed" | "snoozed") =>
    act({ kind: "signal.decided", signalId: s.id, signalKind: s.kind, itemId: s.itemId, decision, reason: decision === "dismissed" ? reason : undefined });

  return (
    <div className={`card${decided && s.state !== "accepted" ? " decided" : ""}`} style={{ marginTop: 12 }}>
      <div className="ct">
        <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className={`pill ${s.severity === "high" ? "r" : s.severity === "medium" ? "a" : "n"}`}>{SIGNAL_LABEL[s.kind]}</span>
          <Link href={`/item/${s.itemId}`}>{s.summary}</Link>
        </span>
        <ConfidenceBadge c={s.confidence} />
      </div>
      <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: "var(--t-body)", color: "var(--ink-3)", lineHeight: 1.5 }}>
        {s.evidence.map((e, i) => <li key={i}>{e}</li>)}
      </ul>
      <div className="cite" style={{ color: "var(--ink-4)" }}>
        Source: {s.source}{s.owner ? ` · owner ${s.owner.name}` : ""}
        {s.authorFirst && s.state === "open" && <> · <b>asked {s.authorFirst === memberId ? "you" : firstName(s.authorFirst)} first</b> — the author confirms before anyone acts</>}
      </div>
      <ConfidenceBasis c={s.confidence} />

      {decided ? (
        <div className="decide">
          <span className="stamp">
            <b>{s.state === "accepted" ? "Accepted" : s.state === "dismissed" ? "Dismissed" : "Snoozed to next run"}</b> by {firstName(s.decidedBy)}
            {s.reason ? ` — "${s.reason}"` : ""}
          </span>
          {canAct && ev && <button className="link" type="button" onClick={() => undo(ev.id, ev.actor)}>undo</button>}
        </div>
      ) : (
        canAct && (
          <div className="decide">
            <button className="btn p sm" type="button" onClick={() => decide("accepted")}>Accept</button>
            <select className="inp" aria-label="Dismiss reason" value={reason} onChange={(e) => setReason(e.target.value)}>
              {DISMISS_REASONS.map((r) => <option key={r}>{r}</option>)}
            </select>
            <button className="btn s sm" type="button" onClick={() => decide("dismissed")}>Dismiss</button>
            <button className="btn g sm" type="button" onClick={() => decide("snoozed")}>Snooze</button>
          </div>
        )
      )}

      {s.proposals.length > 0 && s.state !== "dismissed" && s.state !== "snoozed" && (
        <div className="props">
          <div className="fl" style={{ marginBottom: 0 }}>Proposed tracker changes — nothing is sent until approved</div>
          {s.proposals.map((p) => <ProposalRow key={p.id} p={p} w={w} signalId={s.id} signalKind={s.kind} />)}
        </div>
      )}
    </div>
  );
}

// ---- posting an update -------------------------------------------------------

const STATUS_OPTIONS: { v: ItemStatus; l: string }[] = [
  { v: "in_progress", l: "In progress" },
  { v: "blocked", l: "Blocked" },
  { v: "done", l: "Done" },
  { v: "monitoring", l: "Monitoring" },
  { v: "todo", l: "To do" },
];

export function UpdateForm({ item, requestId, onDone }: { item: Item; requestId?: string; onDone?: () => void }) {
  const { act, canAct } = useActor();
  const [status, setStatus] = useState<ItemStatus>(item.status === "spillover" || item.status === "overdue" ? "in_progress" : item.status);
  const [text, setText] = useState("");
  const [next, setNext] = useState("");
  const [blocker, setBlocker] = useState("");
  if (!canAct) return null;
  const d = detect(`${text} ${blocker}`);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    act({ kind: "update.posted", itemId: item.id, status, text: text.trim(), next: next.trim() || null, blocker: status === "blocked" ? blocker.trim() || null : null, requestId });
    setText(""); setNext(""); setBlocker("");
    onDone?.();
  };
  return (
    <form onSubmit={submit} style={{ marginTop: 10 }}>
      <div className="field">
        <div className="fl">Status</div>
        <select className="inp" value={status} onChange={(e) => setStatus(e.target.value as ItemStatus)}>
          {STATUS_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
        </select>
      </div>
      <div className="field">
        <div className="fl">What happened, in your words</div>
        <textarea className="ta" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Waiting on the email provider sandbox, not sure how to proceed." />
        {text.trim().length > 8 && (
          <div className={`detectbox${d.signal && status !== "blocked" ? " hot" : ""}`}>
            {d.signal && status !== "blocked" ? (
              <>Beacon reads this as <b>blocked</b> ({d.hits.map((h) => `${h.phrase} +${h.weight}`).join(", ")}). After you post, it will ask <b>you</b> first whether to raise a blocker — no one else is alerted until you answer.</>
            ) : d.hits.length || d.relief.length ? (
              <>Language check: {[...d.hits, ...d.relief].map((h) => `${h.phrase} ${h.weight > 0 ? "+" : ""}${h.weight}`).join(", ")} — below the blocker threshold.</>
            ) : (
              <>Language check: no blocker wording.</>
            )}
          </div>
        )}
      </div>
      {status === "blocked" && (
        <div className="field">
          <div className="fl">What is blocking it</div>
          <input className="inp" value={blocker} onChange={(e) => setBlocker(e.target.value)} placeholder="e.g. Email provider sandbox access not granted" />
        </div>
      )}
      <div className="field">
        <div className="fl">Next step (optional)</div>
        <input className="inp" value={next} onChange={(e) => setNext(e.target.value)} />
      </div>
      <div className="btnrow">
        <button className="btn p sm" type="submit" disabled={!text.trim()}>Post update</button>
        {onDone && <button className="btn g sm" type="button" onClick={onDone}>Cancel</button>}
      </div>
    </form>
  );
}

// ---- input requests -----------------------------------------------------------

export function RequestCard({ r, w, item }: { r: AgentRequest; w: World; item: Item }) {
  const { act, memberId, canAct } = useActor();
  const [open, setOpen] = useState(false);
  const mine = r.toMemberId === memberId && canAct;
  const to = memberById(r.toMemberId);

  const confirmYes = () => {
    if (r.signalId) act({ kind: "signal.decided", signalId: r.signalId, signalKind: "hidden-blocker", itemId: r.itemId, decision: "accepted" });
    if (r.raise) act({ kind: "proposal.decided", proposalId: r.raise.id, itemId: r.itemId, decision: "approved", change: r.raise.change, origin: "request:confirm-blocker" });
  };
  const confirmNo = () => {
    if (r.signalId) act({ kind: "signal.decided", signalId: r.signalId, signalKind: "hidden-blocker", itemId: r.itemId, decision: "dismissed", reason: "Not a real problem" });
  };

  return (
    <div className="ai" style={{ marginTop: 12 }}>
      <div className="aihead">
        <div className="ct">{code(r.itemId)} · {mine ? "asking you" : `asking ${to?.name.split(" ")[0] ?? "owner"}`}</div>
        <span className={`conf${r.asks > 2 ? " low" : ""}`}>{r.asks > 1 ? `asked at ${r.asks} daily runs` : "asked today"}</span>
      </div>
      <div className="aiout">{r.question}</div>
      <div className="cite">
        {r.kind === "confirm-blocker"
          ? "Author-first: only you see this until you answer. Yes raises the blocker in the tracker (preview below); No drops it."
          : `Open since day ${r.sinceDay} · re-asked each daily run until answered`}
      </div>
      {r.kind === "confirm-blocker" && r.raise && (
        <div className="prop" style={{ marginTop: 8 }}>
          <div className="pl">{r.raise.change.label}<span className="pv">{code(r.itemId)}: {r.raise.change.to}</span></div>
        </div>
      )}
      <div className="aiact">
        {mine && r.kind === "confirm-blocker" && (
          <>
            <button className="btn p sm" type="button" onClick={confirmYes}>Yes, raise it</button>
            <button className="btn s sm" type="button" onClick={confirmNo}>No, I&apos;m not blocked</button>
          </>
        )}
        {mine && r.kind === "update" && !open && <button className="btn p sm" type="button" onClick={() => setOpen(true)}>Answer with an update</button>}
        {!mine && <span className="stamp">Waiting on {to?.name.split(" ")[0] ?? "the owner"}</span>}
        <Link className="btn s sm" href={`/item/${r.itemId}`}>Open {code(r.itemId)}</Link>
      </div>
      {open && <UpdateForm item={item} requestId={r.id} onDone={() => setOpen(false)} />}
    </div>
  );
}

// ---- audit: activity log + outbox ----------------------------------------------

function describe(e: BeaconEvent): string {
  switch (e.kind) {
    case "update.posted": return `posted an update on ${code(e.itemId)} (${e.status.replace("_", " ")})${e.requestId ? " — answering the agent" : ""}`;
    case "signal.decided": return `${e.decision} "${SIGNAL_LABEL[e.signalKind as keyof typeof SIGNAL_LABEL] ?? e.signalKind}" on ${code(e.itemId)}${e.reason ? ` — ${e.reason}` : ""}`;
    case "proposal.decided": return `${e.decision} "${e.change.label}" on ${code(e.itemId)}`;
    case "retro.adopted": return `adopted a retro action: ${e.action}`;
    case "feedback.given": return `marked ${e.target} as ${e.helpful ? "helpful" : "not helpful"}`;
    case "event.undone": return "undid an earlier decision";
  }
}

export function ActivityLog({ w, all }: { w: World; all: BeaconEvent[] }) {
  const { canAct } = useActor();
  const live = new Set(effective(all).map((e) => e.id));
  const rows = [...all].reverse();
  return (
    <div className="card log">
      <div className="ct">Activity log <span className="mut">every human decision, newest first</span></div>
      {rows.length === 0 && <div className="sub" style={{ marginTop: 6 }}>No decisions recorded yet. Accept, dismiss or approve something and it appears here.</div>}
      {rows.map((e) => (
        <div key={e.id} className="row">
          <time>{time(e.at)}</time>
          <div className="nm" style={{ fontWeight: 500, textDecoration: !live.has(e.id) && e.kind !== "event.undone" ? "line-through" : undefined }}>
            <b>{firstName(e.actor)}</b> {describe(e)}
          </div>
          {canAct && live.has(e.id) && <button className="link" type="button" onClick={() => undo(e.id, e.actor)}>undo</button>}
        </div>
      ))}
      <div className="drill" style={{ cursor: "default" }}>{w.events.length} decision(s) in effect.</div>
    </div>
  );
}

export function Outbox({ w }: { w: World }) {
  const rows = outbox(w);
  return (
    <div className="card">
      <div className="ct">Tracker outbox <span className="mut">simulated — no Jira/ADO connection in the prototype</span></div>
      <div className="sub" style={{ marginTop: 4 }}>Only human-approved changes and people&apos;s own updates land here. The live agent sends these to Jira / Azure DevOps.</div>
      {rows.length === 0 && <div className="sub" style={{ marginTop: 8 }}>Empty — nothing approved yet.</div>}
      {rows.map((r) => (
        <div key={r.eventId} className="row" style={{ alignItems: "flex-start" }}>
          <time style={{ fontSize: 10.5, fontWeight: 800, color: "var(--ink-4)", flex: "0 0 58px", paddingTop: 2 }}>{time(r.at)}</time>
          <div className="nm" style={{ fontWeight: 600 }}>
            {code(r.itemId)} · {r.change.label}
            <small>{r.via} · {firstName(r.actor)}</small>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- helpful / not helpful ------------------------------------------------------

export function Feedback({ target, w, label = "Was this useful?" }: { target: string; w: World; label?: string }) {
  const { act, canAct } = useActor();
  const ev = lastEvent(w, (e) => e.kind === "feedback.given" && e.target === target) as Extract<BeaconEvent, { kind: "feedback.given" }> | undefined;
  if (!canAct) return null;
  return (
    <div className="decide" style={{ marginTop: 10 }}>
      {ev ? (
        <span className="stamp">Marked <b>{ev.helpful ? "helpful" : "not helpful"}</b> · <button className="link" type="button" onClick={() => undo(ev.id, ev.actor)}>undo</button></span>
      ) : (
        <>
          <span className="stamp">{label}</span>
          <button className="btn s sm" type="button" onClick={() => act({ kind: "feedback.given", target, helpful: true })}>Helpful</button>
          <button className="btn g sm" type="button" onClick={() => act({ kind: "feedback.given", target, helpful: false })}>Not helpful</button>
        </>
      )}
    </div>
  );
}
