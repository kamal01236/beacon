import Link from "next/link";
import { activeSprint, lastSprint, activeItems } from "@/lib/data";
import { attentionScore } from "@/lib/priorityScore";

export default function ManagerPage() {
  const items = activeItems();
  const atRisk = items.filter((i) => attentionScore(i).value >= 70).length;
  const m = activeSprint.metrics;

  const tiles = [
    { label: "Velocity (last)", value: `${lastSprint.velocityActual}/${lastSprint.velocityGoal}`, cls: "" },
    { label: "Participation", value: `${Math.round(Number(m.participationRate) * 100)}%`, cls: "good" },
    { label: "Blocker visibility", value: `${m.blockerVisibilityDays}d`, cls: "good" },
    { label: "Items at risk", value: atRisk, cls: "bad" },
  ];

  return (
    <>
      <h1 className="h1">Delivery — manager view</h1>
      <div className="sub">{activeSprint.client} · {activeSprint.project}. Team-level signal only — Beacon does not score individuals.</div>

      <div className="banner bad" style={{ marginTop: 14 }}>
        <div className="bt"><b>One deliverable is at risk this sprint.</b> REQ-001 (Payment Gateway) is blocked on the critical path with 2 dependents. <Link href="/delivery" style={{ textDecoration: "underline" }}>See the roll-up</Link>.</div>
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
        <Link className="card" href="/people"><div className="ct">Team status →</div><div className="sub" style={{ marginTop: 4 }}>Who updated, who owns what, where help is needed.</div></Link>
        <Link className="card" href="/insights"><div className="ct">Insights →</div><div className="sub" style={{ marginTop: 4 }}>Root cause of blockers, trends, and measured impact.</div></Link>
        <Link className="card" href="/delivery"><div className="ct">Delivery roll-up →</div><div className="sub" style={{ marginTop: 4 }}>True status of each deliverable, including hidden dependency risk.</div></Link>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="ct">Why no individual leaderboard?</div>
        <div className="sub" style={{ marginTop: 6 }}>
          Beacon is a delivery-health tool, not a surveillance tool. It surfaces where <i>work</i> needs
          help, never ranks people. This is a product decision, by design — not a missing feature.
        </div>
      </div>
    </>
  );
}
