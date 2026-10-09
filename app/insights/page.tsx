"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { activeSprint, lastSprint, code } from "@/lib/data";
import { Burndown, VelocityBars, DeltaGrid, StatusDonut } from "@/components/charts";
import { burndown, velocitySeries, impactDeltas, statusBreakdown } from "@/lib/metrics";
import { rootCauses, adoption, measured } from "@/lib/insights";
import { useWorld } from "@/lib/useWorld";
import type { World } from "@/lib/data";

const LENSES = [
  { key: "root", label: "Root cause" },
  { key: "trends", label: "Trends" },
  { key: "impact", label: "Impact" },
  { key: "adoption", label: "Adoption" },
];

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default function InsightsPage() {
  return (
    <Suspense fallback={<div className="sub">Loading insights…</div>}>
      <InsightsInner />
    </Suspense>
  );
}

function InsightsInner() {
  const w = useWorld();
  const view = useSearchParams().get("view") ?? "root";
  return (
    <>
      <h1 className="h1">Insights</h1>
      <div className="sub">Where delivery friction comes from, how it&apos;s trending, the measured impact, and whether the team trusts the agent.</div>

      <div className="lens" aria-label="Insights views">
        {LENSES.map((l) => (
          <Link key={l.key} href={`/insights?view=${l.key}`} className={view === l.key ? "on" : ""} aria-current={view === l.key ? "page" : undefined}>{l.label}</Link>
        ))}
      </div>

      {view === "root" && <RootCause w={w} />}
      {view === "trends" && <Trends w={w} />}
      {view === "impact" && <Impact w={w} />}
      {view === "adoption" && <Adoption w={w} />}
    </>
  );
}

function RootCause({ w }: { w: World }) {
  const causes = rootCauses(w);
  const max = Math.max(1, ...causes.map((c) => c.daysLost));
  return (
    <>
      <div className="card" style={{ marginTop: 14 }}>
        <div className="ct">Blocker root cause <span className="mut">this sprint · classified from what people wrote</span></div>
        {causes.length === 0 && <div className="sub" style={{ marginTop: 6 }}>No friction episodes this sprint.</div>}
        {causes.map((c) => (
          <div key={c.key} style={{ marginTop: 14 }}>
            <div className="barlab"><span>{c.label} · {c.items.map(code).join(", ")}</span><span>{c.daysLost} day(s)</span></div>
            <div className="bar"><i className="bad" style={{ width: `${(100 * c.daysLost) / max}%` }} /></div>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12, color: "var(--ink-3)", lineHeight: 1.5 }}>
              {c.evidence.slice(0, 2).map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        ))}
      </div>
      {causes[0] && (
        <div className="banner ai" style={{ marginTop: 12 }}>
          <div className="bt">
            <b>Theme:</b> {causes.slice(0, 2).map((c) => `${c.label.toLowerCase()} (${c.daysLost} day(s) across ${c.items.length} item(s))`).join(" and ")} account for most of the friction. {causes[0].action}
          </div>
        </div>
      )}
      <div className="sub" style={{ marginTop: 8 }}>Days count from the first update that read as blocked (or the formal raise) to today. Categories come from keyword rules in <code>lib/detect.ts</code>.</div>
    </>
  );
}

function Trends({ w }: { w: World }) {
  const s1 = lastSprint.metrics as Record<string, number>;
  const s2 = activeSprint.metrics as Record<string, number>;
  const burn = burndown(w);
  const rows = [
    { label: "Items with owner", a: s1.itemsWithOwner, b: s2.itemsWithOwner },
    { label: "Stories ready", a: s1.storiesReady, b: s2.storiesReady },
  ];
  return (
    <>
      <div className="grid" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="ct">Sprint burndown <span className="mut">Day {burn.today} of {burn.total}</span></div>
          <Burndown data={burn} />
          <div className="legend">
            <span><i style={{ background: "var(--ideal)" }} />ideal</span>
            <span><i style={{ background: "var(--ai-fill)" }} />actual</span>
            <span>{burn.remainingToday}/{burn.committed} left</span>
          </div>
        </div>
        <div className="card">
          <div className="ct">Velocity <span className="mut">goal vs actual</span></div>
          <VelocityBars bars={velocitySeries()} />
        </div>
        <div className="card">
          <div className="ct">Status mix <span className="mut">click to filter the board</span></div>
          <StatusDonut slices={statusBreakdown(w)} />
        </div>
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <div className="ct">Practice signals — Sprint 1 → Sprint 2 <span className="mut">recorded by the team</span></div>
        {rows.map((r) => (
          <div key={r.label} style={{ marginTop: 12 }}>
            <div className="barlab"><span>{r.label}</span><span>{pct(r.a)} → {pct(r.b)}</span></div>
            <div className="bar"><i className="ok" style={{ width: pct(r.b) }} /></div>
          </div>
        ))}
        <div className="sub" style={{ marginTop: 10 }}>Two sprints is a direction, not a trend line — a real trend needs daily history, which the live store keeps from Sprint 3.</div>
      </div>
    </>
  );
}

function Impact({ w }: { w: World }) {
  const m = measured(w);
  return (
    <>
      <div className="banner warn" style={{ marginTop: 14 }}>
        <div className="bt">Sprint 1 figures are an <b>estimated baseline</b>. In a pilot they are replaced by the team&apos;s own measured first week — we never claim improvement against an invented number. Each figure below says where it comes from.</div>
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <div className="ct">Measured impact <span className="mut">Sprint 1 baseline → Sprint 2</span></div>
        <DeltaGrid deltas={impactDeltas(w)} />
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <div className="ct">Blockers caught from wording <span className="mut">computed</span></div>
        {m.detections.map((d) => (
          <div key={d.item.id} className="row">
            <div className="nm">{code(d.item)} — wording read as blocked on day {d.day}<small>{d.raisedDay === null ? "never raised formally — it went overdue instead" : d.leadDays! > 0 ? `raised formally on day ${d.raisedDay}: ${d.leadDays} day(s) of lag Beacon removes` : "raised the same day"}</small></div>
          </div>
        ))}
      </div>
    </>
  );
}

function Adoption({ w }: { w: World }) {
  const a = adoption(w);
  const maxReason = Math.max(1, ...a.dismissReasons.map((r) => r.count));
  return (
    <>
      <div className="sub" style={{ marginTop: 14 }}>
        Is the agent earning trust? Counted from the decisions people record — <b>per team and per signal type, never per person</b>. A signal type that gets dismissed often is a rule to retune, not a person to chase.
      </div>
      <section className="kpis" style={{ marginTop: 12 }}>
        <div className="kpi"><div className="klab">Signals raised</div><div className="kval">{a.signalsRaised}</div></div>
        <div className="kpi good"><div className="klab">Accepted</div><div className="kval">{a.accepted}</div></div>
        <div className="kpi risk"><div className="klab">Dismissed</div><div className="kval">{a.dismissed}</div></div>
        <div className="kpi"><div className="klab">Accept rate</div><div className="kval">{a.acceptRate === null ? "—" : pct(a.acceptRate)}</div></div>
        <div className="kpi"><div className="klab">Changes approved</div><div className="kval">{a.approved}<span style={{ fontSize: 13, color: "var(--ink-4)" }}> / {a.approved + a.rejected}</span></div></div>
        <div className="kpi"><div className="klab">Questions answered</div><div className="kval">{a.requestsAnswered}</div></div>
      </section>

      {a.totalEvents === 0 && (
        <div className="state" style={{ marginTop: 14 }}>
          <div className="st">No decisions yet</div>
          <div className="sx">Accept or dismiss a few signals on the Agent page, approve a proposed change, or answer a question as Marcus — this view fills in as you go.</div>
          <Link className="btn p sm" href="/agent">Open the agent</Link>
        </div>
      )}

      <div className="grid" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="ct">By signal type <span className="mut">feeds back into confidence</span></div>
          {a.byKind.map((k) => (
            <div key={k.kind} style={{ marginTop: 12 }}>
              <div className="barlab">
                <span>{k.label} · {k.raised} open</span>
                <span>{k.accepted} ✓ · {k.dismissed} ✗{k.rate !== null ? ` · ${pct(k.rate)}` : ""}</span>
              </div>
              <div className="bar"><i className={k.rate !== null && k.rate < 0.6 ? "bad" : "ok"} style={{ width: k.rate === null ? "0%" : pct(k.rate) }} /></div>
              {k.rate !== null && k.accepted + k.dismissed >= 3 && k.rate < 0.6 && <div className="drill" style={{ cursor: "default" }}>Below 60% — this rule needs tuning.</div>}
            </div>
          ))}
        </div>
        <div className="card">
          <div className="ct">Why signals were dismissed</div>
          {a.dismissReasons.map((r) => (
            <div key={r.reason} style={{ marginTop: 12 }}>
              <div className="barlab"><span>{r.reason}</span><span>{r.count}</span></div>
              <div className="bar"><i className="warn" style={{ width: `${(100 * r.count) / maxReason}%` }} /></div>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="ct">Engagement</div>
          <div className="rules">
            <b>Updates posted in Beacon</b><span>{a.updatesPosted}</span>
            <b>Snoozed signals</b><span>{a.snoozed}</span>
            <b>Summaries rated helpful</b><span>{a.helpful} of {a.helpful + a.notHelpful}</span>
            <b>Retro actions adopted</b><span>{a.retroAdopted}</span>
          </div>
        </div>
      </div>
    </>
  );
}
