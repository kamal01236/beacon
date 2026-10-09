"use client";

import Link from "next/link";
import { activeItems, memberById, code, isDone } from "@/lib/data";
import { attentionScore, byAttention, ATTENTION_THRESHOLD } from "@/lib/priorityScore";
import { brief, participation } from "@/lib/insights";
import { getRequests } from "@/lib/agent";
import { useWorld } from "@/lib/useWorld";
import { Avatar, TypeTag, StatusPill, ScoreReasons, AiBlock } from "@/components/ui";
import { StatusDonut, Burndown, VelocityBars, TeamPulseCard } from "@/components/charts";
import { Feedback } from "@/components/hic";
import { statusBreakdown, burndown, velocitySeries, teamPulse } from "@/lib/metrics";
import { activeSprint } from "@/lib/data";
import { todayDay } from "@/lib/demo";

export default function OverviewPage() {
  const w = useWorld();
  const items = activeItems(w);
  const ranked = byAttention(items, w);
  const b = brief(w);
  const p = participation(w);
  const requests = getRequests(w);

  const tiles = [
    { label: "Active items", value: items.length, cls: "", q: "" },
    { label: "Needs attention", value: b.hotspots.length, cls: "bad", q: `?min=${ATTENTION_THRESHOLD}` },
    { label: "Blocked", value: items.filter((i) => i.status === "blocked").length, cls: "bad", q: "?status=blocked" },
    { label: "Overdue", value: items.filter((i) => i.status === "overdue").length, cls: "risk", q: "?status=overdue" },
    { label: "Spillover", value: items.filter((i) => i.spillover && !isDone(i)).length, cls: "risk", q: "?status=spillover" },
    { label: "Done", value: items.filter(isDone).length, cls: "good", q: "?status=done" },
  ];

  const slices = statusBreakdown(w);
  const burn = burndown(w);
  const velocity = velocitySeries();
  const pulse = teamPulse(w);

  return (
    <>
      <h1 className="h1">Delivery overview</h1>
      <div className="sub">
        {activeSprint.client} · {activeSprint.project} — Day {todayDay()} of {burn.total}. Every number opens the items behind it.
      </div>

      <div className={`banner ${b.tone === "ok" ? "ai" : b.tone}`} style={{ marginTop: 14 }}>
        <div className="bt"><b>{b.headline}</b> {b.detail}</div>
        <div className="btnrow">
          <Link className={`btn ${b.tone === "bad" ? "d" : "p"} sm`} href="/delivery">See the roll-up</Link>
          {b.focus && <Link className="btn s sm" href={`/item/${b.focus.id}`}>Open {code(b.focus)}</Link>}
        </div>
      </div>

      <section className="kpis" style={{ marginTop: 16 }}>
        {tiles.map((t) => (
          <Link key={t.label} className={`kpi ${t.cls}`} href={`/board${t.q}`}>
            <div className="klab">{t.label} →</div>
            <div className="kval">{t.value}</div>
          </Link>
        ))}
      </section>

      <div className="grid" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="ct">Status mix <span className="mut">click a slice to open the board</span></div>
          <StatusDonut slices={slices} />
        </div>
        <div className="card">
          <div className="ct">Sprint burndown <span className="mut">Day {burn.today} of {burn.total}</span></div>
          <Burndown data={burn} />
          <div className="legend">
            <span><i style={{ background: "var(--ideal)" }} />ideal</span>
            <span><i style={{ background: "var(--ai-fill)" }} />actual remaining</span>
            <span>{burn.remainingToday} of {burn.committed} items left</span>
          </div>
          <div className="drill">Both endpoints are real; future days aren&apos;t drawn — we don&apos;t project numbers we don&apos;t have.</div>
        </div>
        <div className="card">
          <div className="ct">Velocity <span className="mut">goal vs actual</span></div>
          <VelocityBars bars={velocity} />
          <div className="legend">
            <span><i style={{ background: "#C9D6E2" }} />goal</span>
            <span><i style={{ background: "var(--ai-fill)" }} />actual</span>
          </div>
        </div>
      </div>

      <div className="cols" style={{ marginTop: 16 }}>
        <div className="col">
          <div className="card">
            <div className="ct">Needs attention <span className="mut">ranked by explainable score</span></div>
            {ranked.slice(0, 6).map((it) => {
              const owner = memberById(it.owner);
              return (
                <Link key={it.id} className="row" href={`/item/${it.id}`}>
                  <Avatar member={owner} />
                  <div className="nm">
                    <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <TypeTag item={it} /> {it.title} <StatusPill status={it.status} />
                    </span>
                    <ScoreReasons score={attentionScore(it, w)} showSum={false} />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="col narrow">
          <AiBlock
            title={`Daily brief — Day ${todayDay()}`}
            cite={`Built from: ${b.basis}`}
            footer={<Feedback target="the daily brief" w={w} />}
          >
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {b.lines.map((l, i) => <li key={i}>{l}</li>)}
            </ul>
            <div className="aiact" style={{ marginTop: 10 }}>
              <Link className="btn p sm" href={`/board?min=${ATTENTION_THRESHOLD}`}>Review the {b.hotspots.length} hotspots</Link>
            </div>
          </AiBlock>

          <div className="card">
            <div className="ct">Today&apos;s stand-up</div>
            <div className="sub" style={{ marginTop: 2 }}>
              {p.freshCount} of {p.expected} people with work in flight have posted since yesterday.
              {p.quiet.length > 0 && <> Still quiet: {p.quiet.map((m) => m.name.split(" ")[0]).join(", ")}.</>}
              {requests.length > 0 && <> The agent is waiting on {requests.length} answer(s).</>}
            </div>
            <Link className="drill" href="/agent">Open the agent&apos;s questions →</Link>
          </div>

          <TeamPulseCard pulse={pulse} />
        </div>
      </div>
    </>
  );
}
