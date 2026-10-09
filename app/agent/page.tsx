"use client";

import Link from "next/link";
import { useState } from "react";
import { getRun, getSignals, getRequests, detections, SIGNAL_LABEL, type SignalKind } from "@/lib/agent";
import { code, firstName, itemById } from "@/lib/data";
import { useAllEvents, useWorld } from "@/lib/useWorld";
import { ActivityLog, Outbox, ReadOnlyNote, RequestCard, SignalCard } from "@/components/hic";
import { PrivacyCard } from "@/components/privacy";

export default function AgentPage() {
  const w = useWorld();
  const all = useAllEvents();
  const run = getRun(w);
  const signals = getSignals(w);
  const requests = getRequests(w);
  const caught = detections(w);
  const [kind, setKind] = useState<SignalKind | "all">("all");
  const [showDecided, setShowDecided] = useState(false);

  const kinds = (Object.keys(SIGNAL_LABEL) as SignalKind[]).filter((k) => signals.some((s) => s.kind === k));
  const visible = signals.filter((s) => (kind === "all" || s.kind === kind) && (showDecided || s.state === "open" || s.state === "accepted"));
  const hidden = signals.filter((s) => s.state === "dismissed" || s.state === "snoozed").length;

  return (
    <>
      <h1 className="h1">Beacon agent</h1>
      <div className="sub">
        Runs every {run.intervalMins} minutes and on tracker events. It assesses every item, asks people when the data
        can&apos;t answer, and proposes changes — <b>it never changes the tracker itself</b>. You accept, dismiss or approve.
      </div>
      <ReadOnlyNote />

      <div className="card" style={{ marginTop: 14 }}>
        <div className="ct">Last run <span className="mut">{run.ranAt} · {run.trigger === "event" ? "re-run on your decisions" : "scheduled"}</span></div>
        <div className="kpis" style={{ marginTop: 12 }}>
          <div className="kpi"><div className="klab">Items scanned</div><div className="kval">{run.itemsScanned}</div></div>
          <div className="kpi bad"><div className="klab">Open signals</div><div className="kval">{run.signalsOpen}</div></div>
          <div className="kpi good"><div className="klab">Decided</div><div className="kval">{run.signalsDecided}</div></div>
          <div className="kpi risk"><div className="klab">Awaiting answers</div><div className="kval">{run.openRequests}</div></div>
          <div className="kpi"><div className="klab">Proposals to review</div><div className="kval">{run.pendingProposals}</div></div>
        </div>
        <div className="chips" style={{ marginTop: 12 }}>
          {run.scope.map((s) => <span key={s} className="chip ai">{s}</span>)}
          <span className="chip">memory: {run.memory}</span>
        </div>
      </div>

      <div className="cols" style={{ marginTop: 16 }}>
        <div className="col">
          <h2 className="h2" style={{ marginTop: 0 }}>Questions the agent is asking</h2>
          <div className="sub" style={{ marginTop: -4 }}>When the data can&apos;t answer, the agent asks one person — and re-asks each daily run until answered.</div>
          {requests.length === 0 && (
            <div className="state" style={{ marginTop: 10 }}>
              <div className="st">Nothing outstanding</div>
              <div className="sx">Every question has an answer; the agent keeps watching.</div>
            </div>
          )}
          {requests.map((r) => <RequestCard key={r.id} r={r} w={w} item={itemById(r.itemId, w)!} />)}

          <h2 className="h2">Assessments</h2>
          <div className="filterbar" role="group" aria-label="Filter signals">
            <button type="button" className={kind === "all" ? "on" : ""} onClick={() => setKind("all")}>All ({signals.length})</button>
            {kinds.map((k) => (
              <button key={k} type="button" className={kind === k ? "on" : ""} onClick={() => setKind(k)}>
                {SIGNAL_LABEL[k]} ({signals.filter((s) => s.kind === k).length})
              </button>
            ))}
          </div>
          {visible.map((s) => <SignalCard key={s.id} s={s} w={w} />)}
          {visible.length === 0 && <div className="state" style={{ marginTop: 12 }}><div className="st">Nothing open here</div><div className="sx">Everything in this view has been decided.</div></div>}
          {hidden > 0 && (
            <button className="btn g sm" type="button" style={{ marginTop: 10 }} onClick={() => setShowDecided((v) => !v)}>
              {showDecided ? "Hide" : "Show"} {hidden} dismissed / snoozed
            </button>
          )}
        </div>

        <div className="col narrow">
          <div className="card">
            <div className="ct">Caught early this sprint</div>
            <div className="sub" style={{ marginTop: 4 }}>Update wording that read as blocked, compared with when — or whether — a blocker was raised.</div>
            {caught.map((d) => (
              <Link key={d.item.id} className="row" href={`/item/${d.item.id}`} style={{ alignItems: "flex-start" }}>
                <div className="nm">
                  {code(d.item)} · day {d.day} · {firstName(d.author)}
                  <small>{d.phrases.join(", ")}</small>
                  <small>{d.raisedDay === null ? "Never raised as a blocker" : d.leadDays! > 0 ? `Raised on day ${d.raisedDay} — ${d.leadDays} days later` : `Raised the same day`}</small>
                </div>
              </Link>
            ))}
            {caught.length === 0 && <div className="sub" style={{ marginTop: 6 }}>No blocker wording detected yet.</div>}
          </div>
          <Outbox w={w} />
          <ActivityLog w={w} all={all} />
          <PrivacyCard all={all} />
        </div>
      </div>
    </>
  );
}
