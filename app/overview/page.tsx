import Link from "next/link";
import { activeItems, memberById } from "@/lib/data";
import { attentionScore, byAttention } from "@/lib/priorityScore";
import { Avatar, TypeTag, StatusPill, ScoreReasons } from "@/components/ui";
import { StatusDonut, Burndown, VelocityBars, TeamPulseCard } from "@/components/charts";
import { statusBreakdown, burndown, velocitySeries, teamPulse } from "@/lib/metrics";

export default function OverviewPage() {
  const items = activeItems();
  const ranked = byAttention(items);
  const blocked = items.filter((i) => i.status === "blocked");
  const overdue = items.filter((i) => i.status === "overdue");
  const spillover = items.filter((i) => i.spillover);
  const attn = ranked.filter((i) => attentionScore(i).value >= 70);
  const done = items.filter((i) => i.status === "done" || i.status === "confirmed" || i.status === "resolved");

  const slices = statusBreakdown();
  const burn = burndown();
  const velocity = velocitySeries();
  const pulse = teamPulse();

  const tiles = [
    { label: "Active items", value: items.length, cls: "", q: "" },
    { label: "Needs attention", value: attn.length, cls: "bad", q: "?min=70" },
    { label: "Blocked", value: blocked.length, cls: "bad", q: "?status=blocked" },
    { label: "Overdue", value: overdue.length, cls: "risk", q: "?status=overdue" },
    { label: "Spillover", value: spillover.length, cls: "risk", q: "?status=spillover" },
    { label: "Done", value: done.length, cls: "good", q: "?status=done" },
  ];

  return (
    <>
      <h1 className="h1">Delivery overview</h1>
      <div className="sub">
        Apex Financial · Client Portal Modernization — what needs attention right now.
        Every tile opens the board filtered to exactly those items.
      </div>

      {/* The headline: the roll-up Jira can't show */}
      <div className="banner bad" style={{ marginTop: 14 }}>
        <div className="bt">
          <b>REQ-001 Payment Gateway cannot be delivered this sprint.</b> Its own status
          says <i>In&nbsp;progress</i>, but its blocker (Stripe signature verification) is
          open and <b>2 child items depend on it</b>. Jira rolls the story up as green.
          Day&nbsp;8 of&nbsp;10.
        </div>
        <div className="btnrow">
          <Link className="btn d sm" href="/delivery">See the roll-up</Link>
          <Link className="btn s sm" href="/item/req-001">Open REQ-001</Link>
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
                    <ScoreReasons score={attentionScore(it)} showSum={false} />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="col narrow">
          <div className="ai">
            <div className="aihead">
              <div className="ct">AI daily brief — Day 8</div>
              <span className="conf">confidence 90%</span>
            </div>
            <div className="aiout">
              One item is off-track: <b>REQ-001</b> is blocked and on the critical path, with
              REQ-003 and the export flow waiting on it. <b>ACT-001</b> is 5 days overdue and
              carries client impact. Participation is healthy (5 of 6 updated today).
            </div>
            <div className="cite">Drawn from: {items.length} active items · today&apos;s updates · dependency graph</div>
            <div className="aiact">
              <Link className="btn p sm" href="/board?min=70">Review the 3 hotspots</Link>
            </div>
          </div>

          <div className="card">
            <div className="ct">Today&apos;s stand-up</div>
            <div className="sub" style={{ marginTop: 2 }}>{pulse.updatedToday} of {pulse.teamSize} updated · Aisha nudged automatically</div>
            <Link className="drill" href="/people">Open team status →</Link>
          </div>

          <TeamPulseCard pulse={pulse} />
        </div>
      </div>
    </>
  );
}
