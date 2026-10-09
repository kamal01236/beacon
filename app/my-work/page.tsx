"use client";

import Link from "next/link";
import { useState } from "react";
import { PERSONA, memberById, itemsOwnedBy, progressFor, updatesBy, itemById, code, isDone } from "@/lib/data";
import { attentionScore, byAttention } from "@/lib/priorityScore";
import { getRequests } from "@/lib/agent";
import { useWorld } from "@/lib/useWorld";
import { TypeTag, StatusPill } from "@/components/ui";
import { RequestCard, UpdateForm } from "@/components/hic";
import type { Item } from "@/lib/types";

function MyItem({ it, score }: { it: Item; score: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="row" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
      <div className="nm" style={{ minWidth: 220 }}>
        <Link href={`/item/${it.id}`} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <TypeTag item={it} /> {it.title} <StatusPill status={it.status} />
        </Link>
        <div className="barlab" style={{ marginTop: 6 }}><span>Progress · attention {score}</span><span>{progressFor(it)}%</span></div>
        <div className="bar"><i className={it.status === "blocked" ? "bad" : it.status === "spillover" ? "warn" : ""} style={{ width: `${progressFor(it)}%` }} /></div>
        {open && <UpdateForm item={it} onDone={() => setOpen(false)} />}
      </div>
      {!open && !isDone(it) && (
        <div className="btnrow">
          {it.status === "blocked" && <Link className="btn s sm" href="/get-help">Get help</Link>}
          <button className="btn p sm" type="button" onClick={() => setOpen(true)}>Update</button>
        </div>
      )}
    </div>
  );
}

export default function MyWorkPage() {
  const w = useWorld();
  const me = memberById(PERSONA.member.memberId)!;
  const owned = byAttention(itemsOwnedBy(me.id, w), w);
  const ups = updatesBy(me.id, w);
  const blocked = owned.filter((i) => i.status === "blocked");
  const mine = getRequests(w).filter((r) => r.toMemberId === me.id);
  const top = owned.find((i) => !isDone(i));

  return (
    <>
      <h1 className="h1">Good morning, {me.name.split(" ")[0]}</h1>
      <div className="sub">{owned.length} item(s) assigned · {blocked.length} blocked · {mine.length} question(s) from the agent</div>

      {mine.map((r) => <RequestCard key={r.id} r={r} w={w} item={itemById(r.itemId, w)!} />)}
      {mine.length === 0 && top && (
        <div className="banner ai" style={{ marginTop: 14 }}>
          <div className="bt"><b>Nothing waiting on you.</b> Your top item is {code(top)} ({top.title}) at attention {attentionScore(top, w).value}.</div>
          <div className="btnrow"><Link className="btn s sm" href={`/item/${top.id}`}>Open {code(top)}</Link></div>
        </div>
      )}

      <section className="kpis" style={{ marginTop: 16 }}>
        <div className="kpi"><div className="klab">My items</div><div className="kval">{owned.length}</div></div>
        <div className="kpi bad"><div className="klab">Blocked</div><div className="kval">{blocked.length}</div></div>
        <div className="kpi good"><div className="klab">Updates posted</div><div className="kval">{ups.filter((u) => u.progressText).length}</div></div>
        <div className="kpi"><div className="klab">My points <span title="Visible only to you">· only you</span></div><div className="kval">{me.points}</div></div>
      </section>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="ct">My items <span className="mut">post an update — Beacon checks the wording and asks you first</span></div>
        {owned.map((it) => <MyItem key={it.id} it={it} score={attentionScore(it, w).value} />)}
      </div>
    </>
  );
}
