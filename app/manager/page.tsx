"use client";

import Link from "next/link";
import { activeSprint, lastSprint, activeItems } from "@/lib/data";
import { needsAttention } from "@/lib/priorityScore";
import { brief, participation, adoption } from "@/lib/insights";
import { useWorld } from "@/lib/useWorld";

export default function ManagerPage() {
  const w = useWorld();
  const items = activeItems(w);
  const b = brief(w);
  const p = participation(w);
  const a = adoption(w);

  const tiles = [
    { label: "Velocity (last sprint)", value: `${lastSprint.velocityActual}/${lastSprint.velocityGoal}`, cls: "" },
    { label: "Participation", value: `${Math.round(p.rate * 100)}%`, cls: "good" },
    { label: "Items needing attention", value: items.filter((i) => needsAttention(i, w)).length, cls: "bad" },
    { label: "Agent accept rate", value: a.acceptRate === null ? "—" : `${Math.round(a.acceptRate * 100)}%`, cls: "" },
  ];

  return (
    <>
      <h1 className="h1">Delivery — manager view</h1>
      <div className="sub">{activeSprint.client} · {activeSprint.project}. Team-level signal only — Beacon does not score individuals. Read-only.</div>

      <div className={`banner ${b.tone === "ok" ? "ai" : b.tone}`} style={{ marginTop: 14 }}>
        <div className="bt"><b>{b.headline}</b> {b.detail} <Link href="/delivery" style={{ textDecoration: "underline" }}>See the roll-up</Link>.</div>
      </div>

      <section className="kpis" style={{ marginTop: 16 }}>
        {tiles.map((t) => (
          <div key={t.label} className={`kpi ${t.cls}`}>
            <div className="klab">{t.label}</div>
            <div className="kval">{t.value}</div>
          </div>
        ))}
      </section>

      <div className="grid" style={{ marginTop: 16 }}>
        <Link className="card" href="/delivery"><div className="ct">Delivery roll-up →</div><div className="sub" style={{ marginTop: 4 }}>True status of each deliverable, including dependency risk the tracker hides.</div></Link>
        <Link className="card" href="/insights"><div className="ct">Insights →</div><div className="sub" style={{ marginTop: 4 }}>Root cause of blockers, trends, measured impact and adoption.</div></Link>
        <Link className="card" href="/agent"><div className="ct">Agent →</div><div className="sub" style={{ marginTop: 4 }}>What the agent found and what the team decided — read-only for managers.</div></Link>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="ct">Why no individual leaderboard?</div>
        <div className="sub" style={{ marginTop: 6 }}>
          Beacon is a delivery-health tool, not a surveillance tool. It surfaces where <i>work</i> needs
          help, never ranks people. Managers see team-level figures only — member drill-downs and personal
          trends stay with the team. This is a product decision, by design — not a missing feature.
        </div>
      </div>
    </>
  );
}
