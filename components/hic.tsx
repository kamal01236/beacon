"use client";

// Human-in-control controls — one implementation, used on every screen that
// lets a person act on what the agent found.

import Link from "next/link";
import { useState } from "react";
import { code, firstName, memberById, type World } from "@/lib/data";
import { SIGNAL_LABEL, type AgentRequest, type AgentSignal, type Confidence, type Proposal } from "@/lib/agent";
import { detect } from "@/lib/detect";
import { analyze, type Analysis } from "@/lib/analyze";
import { compose, type Composed } from "@/lib/compose";
import { DISMISS_REASONS, effective, undo, type BeaconEvent } from "@/lib/events";
import { SYSTEM_ACTOR } from "@/lib/policy";
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

// ---- re-analyze (edit the agent's reading, then re-check) ------------------

/** Shared state for a "Re-analyze with agent" control: run it, hold the result. */
export function useReanalyze(itemId: string) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (text: string, status?: ItemStatus) => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      setAnalysis(await analyze(itemId, text.trim(), status));
    } finally {
      setBusy(false);
    }
  };
  return { analysis, busy, run, reset: () => setAnalysis(null) };
}

/** The agent's plain-language verdict on an edited draft — shown before submit. */
export function AnalysisPanel({ a }: { a: Analysis }) {
  const phrases = [...a.hits, ...a.relief];
  return (
    <div className={`detectbox${a.signal ? " hot" : ""}`} style={{ marginTop: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
        <span className={`pill ${a.signal ? "r" : "n"}`}>{a.verdict === "blocked" ? "reads as blocked" : "not blocked"}</span>
        <span style={{ color: "var(--ink-4)" }}>
          score {a.score} / threshold {a.threshold} ·{" "}
          {a.source === "agent" ? `${a.provider ?? "agent"}${a.model ? ` (${a.model})` : ""}` : "local rules (no backend)"}
        </span>
      </div>
      <div>{a.answer}</div>
      {phrases.length > 0 && (
        <div style={{ color: "var(--ink-4)", marginTop: 4 }}>{phrases.map((h) => `${h.phrase} ${h.weight > 0 ? "+" : ""}${h.weight}`).join(", ")}</div>
      )}
    </div>
  );
}

// ---- proposals (tracker changes) -------------------------------------------

export function ProposalRow({ p, w, signalId, signalKind }: { p: Proposal; w: World; signalId?: string; signalKind?: string }) {
  const { act, canAct } = useActor();
  const ev = lastEvent(w, (e) => e.kind === "proposal.decided" && e.proposalId === p.id);
  // The agent-drafted text fields a person may edit before approving.
  const editable = p.change.field === "comment" || p.change.field === "blocker" || p.change.field === "create";
  const [val, setVal] = useState(p.change.to);
  const [editing, setEditing] = useState(false);
  const { analysis, busy, run, reset } = useReanalyze(p.itemId);
  // "Draft with agent": the model re-words the intent Beacon already decided.
  const [drafting, setDrafting] = useState(false);
  const [drafted, setDrafted] = useState<Composed | null>(null);

  // The text that will actually be sent: the person's edit if they changed it, else the agent's draft.
  const trimmed = val.trim();
  const isEdited = trimmed !== "" && trimmed !== p.change.to;
  const outgoing = isEdited ? trimmed : p.change.to;

  // Only a comment is free prose the model can usefully re-word; a status or a
  // dependency link is a structured change, so drafting it would be meaningless.
  const draftable = p.change.field === "comment";

  const draft = async () => {
    setDrafting(true);
    try {
      const c = await compose(p.itemId, p.change.label, outgoing);
      setDrafted(c);
      // The draft lands in the SAME field the person edits and approves, so
      // there is still one source of truth for what gets sent.
      setVal(c.text);
      setEditing(true);
      reset();
    } finally {
      setDrafting(false);
    }
  };

  const decide = (decision: "approved" | "rejected") => {
    if (decision === "approved" && signalId && signalKind) {
      const s = lastEvent(w, (e) => e.kind === "signal.decided" && e.signalId === signalId);
      if (!s) act({ kind: "signal.decided", signalId, signalKind, itemId: p.itemId, decision: "accepted" });
    }
    const edited = decision === "approved" && isEdited;
    const change = edited ? { ...p.change, to: trimmed, label: `${p.change.label} (edited)` } : p.change;
    act({ kind: "proposal.decided", proposalId: p.id, itemId: p.itemId, decision, change, origin: p.origin });
  };

  // One field, one source of truth: the preview always reflects `outgoing` — the live
  // edit while typing, and the final sent text once edited — so what you see is what posts.
  const shown = editing ? (trimmed || p.change.to) : outgoing;
  const previewText =
    p.change.field === "comment" ? `Comment on ${code(p.itemId)}: ${shown}`
    : p.change.field === "link" ? `${code(p.itemId)} ${shown}`
    : `${code(p.itemId)}: ${shown}`;

  return (
    <div className={`prop${editing ? " editing" : ""}`}>
      <div className="pl">
        <span className="pl-head">
          {p.change.label}
          {editing ? <span className="edit-tag">editing</span> : isEdited ? <span className="edit-tag">edited</span> : null}
        </span>
        {!editing && <span className="pv">{previewText}</span>}
      </div>
      {p.state === "pending" && canAct && editing && (
        <div className="field prop-edit">
          <label className="fl" htmlFor={`edit-${p.id}`}>Edit the text that will be sent</label>
          <textarea id={`edit-${p.id}`} className="ta" rows={3} value={val} onChange={(e) => { setVal(e.target.value); reset(); }} aria-label="Edit the proposed text" />
          <div className="hint">Replaces the agent&apos;s wording. Re-analyze to see how it reads, then Approve to send it to the tracker exactly as written.</div>
        </div>
      )}
      {drafted && (
        <div className="detectbox" style={{ marginTop: 8 }}>
          {drafted.source === "llm"
            ? <>Drafted by {drafted.provider}{drafted.model ? ` (${drafted.model})` : ""} from the intent &ldquo;{p.change.label}&rdquo;. Edit it freely — it is a suggestion, not a decision.</>
            : <>This is the rule template, unchanged — no model is configured, or the one that is could not be reached. Either way the text stays approvable; set <code>OPENAI_API_KEY</code>, or point <code>BEACON_LLM_PROVIDER</code> at a local Ollama, to have one drafted.</>}
        </div>
      )}
      {analysis && <AnalysisPanel a={analysis} />}
      {p.state === "pending" ? (
        canAct && (
          <div className="btnrow">
            {editable && !editing && <button className="btn g sm" type="button" onClick={() => setEditing(true)}>{isEdited ? "Edit again" : "Edit"}</button>}
            {draftable && <button className="btn g sm" type="button" disabled={drafting} onClick={draft}>{drafting ? "Drafting…" : "Draft with agent"}</button>}
            {editing && <button className="btn g sm" type="button" disabled={busy || !trimmed} onClick={() => run(outgoing, p.change.status)}>{busy ? "Analyzing…" : "Re-analyze"}</button>}
            {editing && <button className="btn g sm" type="button" onClick={() => setEditing(false)}>Done</button>}
            <button className="btn p sm" type="button" disabled={!outgoing.trim()} onClick={() => decide("approved")}>{isEdited ? "Approve edited" : "Approve"}</button>
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
  const { analysis, busy, run, reset } = useReanalyze(item.id);
  if (!canAct) return null;
  const d = detect(`${text} ${blocker}`);
  const draftText = `${text} ${status === "blocked" ? blocker : ""}`.trim();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    act({ kind: "update.posted", itemId: item.id, status, text: text.trim(), next: next.trim() || null, blocker: status === "blocked" ? blocker.trim() || null : null, requestId });
    setText(""); setNext(""); setBlocker(""); reset();
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
      {analysis && <AnalysisPanel a={analysis} />}
      <div className="btnrow">
        <button className="btn g sm" type="button" disabled={!text.trim() || busy} onClick={() => run(draftText, status)}>
          {busy ? "Analyzing…" : "Re-analyze with agent"}
        </button>
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
    case "data.reset": return `reset this instance — ${e.removed} earlier decision(s) deleted from ${e.scope === "server" ? "the shared server log" : "this browser"}`;
    case "data.retained": return `applied the retention policy — ${e.removed} decision(s) older than ${e.olderThanDays} days deleted`;
  }
}

/** Beacon acts as itself for the retention sweep; everything else is a person. */
const actorName = (id: string) => (id === SYSTEM_ACTOR ? "Beacon" : firstName(id));

/** A deletion cannot be taken back, so the log does not offer undo on one. */
const reversible = (e: BeaconEvent) => e.kind !== "data.reset" && e.kind !== "data.retained";

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
            <b>{actorName(e.actor)}</b> {describe(e)}
          </div>
          {canAct && live.has(e.id) && reversible(e) && <button className="link" type="button" onClick={() => undo(e.id, e.actor)}>undo</button>}
        </div>
      ))}
      {/* The data.* rows record a deletion rather than a decision, so they are
          not counted as one here even though the log keeps them. */}
      <div className="drill" style={{ cursor: "default" }}>{w.events.filter(reversible).length} decision(s) in effect.</div>
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
