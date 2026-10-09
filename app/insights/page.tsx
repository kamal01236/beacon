"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { activeSprint, lastSprint, activeItems, updates } from "@/lib/data";

const LENSES = [
  { key: "root", label: "Root cause" },
  { key: "trends", label: "Trends" },
  { key: "impact", label: "Impact" },
];

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

export default function InsightsPage() {
  return (
    <Suspense fallback={<div className="sub">Loading insights…</div>}>
      <InsightsInner />
    </Suspense>
  );
}

function InsightsInner() {
  const view = useSearchParams().get("view") ?? "root";
  const s1 = lastSprint.metrics;
  const s2 = activeSprint.metrics;

  return (
    <>
      <h1 className="h1">Insights</h1>
      <div className="sub">Where delivery friction comes from, how it&apos;s trending, and the measured impact.</div>

      <div className="lens" aria-label="Insights views">
        {LENSES.map((l) => (
          <Link key={l.key} href={`/insights?view=${l.key}`} className={view === l.key ? "on" : ""} aria-current={view === l.key ? "page" : undefined}>{l.label}</Link>
        ))}
      </div>

      {view === "root" && <RootCause />}
      {view === "trends" && <Trends s1={s1} s2={s2} />}
      {view === "impact" && <Impact s1={s1} s2={s2} />}
    </>
  );
}

function RootCause() {
  const items = activeItems();
  const blockers = items.filter((i) => i.blocker);
  const signals = updates.filter((u) => u.blockerSignal);
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="ct">Blocker root cause <span className="mut">this sprint</span></div>
      <div className="sub" style={{ marginTop: 6 }}>
        {blockers.length} active blocker(s). {signals.length} were visible in update <i>language</i> before being
        formally raised — the detection lag Beacon closes.
      </div>
      {blockers.map((b) => (
        <div key={b.id} className="row"><div className="nm">{b.id.toUpperCase()} — {b.title}<small>{b.blocker}</small></div></div>
      ))}
      <div className="banner ai" style={{ marginTop: 12 }}>
        <div className="bt"><b>Theme:</b> external dependency + ambiguous acceptance criteria account for most blocked time. Clearer stories up front would prevent the rework seen on REQ-001.</div>
      </div>
    </div>
  );
}

function Trends({ s1, s2 }: { s1: any; s2: any }) {
  const rows = [
    { label: "Participation", a: s1.participationRate, b: s2.participationRate },
    { label: "Update quality", a: s1.updateQualityRate, b: s2.updateQualityRate },
    { label: "Items with owner", a: s1.itemsWithOwner, b: s2.itemsWithOwner },
    { label: "Stories ready", a: s1.storiesReady, b: s2.storiesReady },
  ];
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="ct">Trend — Sprint 1 → Sprint 2</div>
      {rows.map((r) => (
        <div key={r.label} style={{ marginTop: 12 }}>
          <div className="barlab"><span>{r.label}</span><span>{pct(r.a)} → {pct(r.b)}</span></div>
          <div className="bar"><i className="ok" style={{ width: pct(r.b) }} /></div>
        </div>
      ))}
      <div className="sub" style={{ marginTop: 10 }}>Two sprints is a direction, not a trend line — a full trend accumulates from Sprint 3.</div>
    </div>
  );
}

function Impact({ s1, s2 }: { s1: any; s2: any }) {
  const rows = [
    { label: "Stand-up time", a: `${s1.standupTimeMins}m`, b: `${s2.standupTimeMins}m` },
    { label: "Blocker visibility", a: `${s1.blockerVisibilityDays}d`, b: `${s2.blockerVisibilityDays}d` },
    { label: "Participation", a: pct(s1.participationRate), b: pct(s2.participationRate) },
    { label: "Update quality", a: pct(s1.updateQualityRate), b: pct(s2.updateQualityRate) },
  ];
  return (
    <>
      <div className="banner warn" style={{ marginTop: 14 }}>
        <div className="bt">Sprint 1 figures are an <b>estimated baseline</b>. In a pilot these are replaced by the team&apos;s own measured first week — we never claim improvement against an invented number.</div>
      </div>
      <div className="kpis" style={{ marginTop: 14 }}>
        {rows.map((r) => (
          <div key={r.label} className="kpi good">
            <div className="klab">{r.label}</div>
            <div className="kval" style={{ fontSize: 20 }}>{r.b}</div>
            <div className="kd flat">was {r.a}</div>
          </div>
        ))}
      </div>
    </>
  );
}
