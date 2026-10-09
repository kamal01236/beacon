import Link from "next/link";
import type { StatusSlice, VelocityBar, BurndownPoint, Delta, TeamPulse } from "@/lib/metrics";
import { memberById } from "@/lib/data";

/* ---------------------------------------------------------------------------
   Hand-drawn SVG charts. No chart library — every mark is placed to scale from
   real data, and the interactive ones link straight into the filtered board so
   analytics lead to action. Shared styling lives under `svg.chart` in globals.css.
--------------------------------------------------------------------------- */

/** A circular donut of status mix. Each arc AND each legend row is a link into
 *  the board filtered to that status. */
export function StatusDonut({ slices }: { slices: StatusSlice[] }) {
  const total = slices.reduce((a, s) => a + s.count, 0);
  const R = 58, SW = 20, C = 2 * Math.PI * R;
  let acc = 0; // cumulative fraction

  return (
    <div className="donutwrap">
      <svg className="chart donut" viewBox="0 0 150 150" role="img" aria-label={`Status mix of ${total} active items`}>
        <g transform="rotate(-90 75 75)">
          <circle cx="75" cy="75" r={R} fill="none" stroke="var(--line)" strokeWidth={SW} />
          {slices.map((s) => {
            const frac = s.count / total;
            const seg = frac * C;
            const el = (
              <circle
                key={s.key}
                cx="75" cy="75" r={R}
                fill="none" stroke={s.color} strokeWidth={SW}
                strokeDasharray={`${seg} ${C - seg}`}
                strokeDashoffset={-acc * C}
              >
                <title>{`${s.label}: ${s.count}`}</title>
              </circle>
            );
            acc += frac;
            // SVG hyperlink → full navigation to the filtered board
            return <a key={s.key} href={s.href} aria-label={`${s.label}: ${s.count} items`}>{el}</a>;
          })}
        </g>
        <text x="75" y="70" textAnchor="middle" className="dnum">{total}</text>
        <text x="75" y="88" textAnchor="middle" className="dlab">active</text>
      </svg>
      <div className="dlegend">
        {slices.map((s) => (
          <Link key={s.key} href={s.href} className="dleg">
            <i style={{ background: s.color }} />
            <span className="dleg-l">{s.label}</span>
            <span className="dleg-n">{s.count}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** A circular progress ring (item / member completion). */
export function ProgressRing({ pct, size = 52, label }: { pct: number; size?: number; label?: string }) {
  const sw = size >= 48 ? 7 : 6;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const band = pct >= 80 ? "var(--ok-fill)" : pct >= 40 ? "var(--ai-fill)" : "var(--overdue-fill)";
  return (
    <div className="ringwrap" style={{ width: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="ring" role="img" aria-label={`${pct}% ${label ?? "complete"}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={sw} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={band} strokeWidth={sw}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x="50%" y="52%" dominantBaseline="middle" textAnchor="middle" className="ringnum">{pct}%</text>
      </svg>
      {label && <div className="ringlab">{label}</div>}
    </div>
  );
}

/** Sprint burndown: ideal line (dashed) + actual remaining to today (solid). */
export function Burndown({ data }: { data: { points: BurndownPoint[]; committed: number; total: number; today: number } }) {
  const { points, committed, total, today } = data;
  const W = 460, H = 190, PL = 32, PR = 12, PT = 12, PB = 26;
  const x = (d: number) => PL + (d / total) * (W - PL - PR);
  const y = (v: number) => PT + (1 - v / committed) * (H - PT - PB);
  const ideal = points.map((p) => `${x(p.day)},${y(p.ideal)}`).join(" ");
  const actualPts = points.filter((p) => p.actual !== null) as (BurndownPoint & { actual: number })[];
  const actual = actualPts.map((p) => `${x(p.day)},${y(p.actual)}`).join(" ");
  const yTicks = [0, Math.round(committed / 2), committed];

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sprint burndown, ideal versus actual remaining">
      {yTicks.map((t) => (
        <g key={t}>
          <line className="gl" x1={PL} y1={y(t)} x2={W - PR} y2={y(t)} />
          <text x={PL - 6} y={y(t) + 3} textAnchor="end" fontSize="9">{t}</text>
        </g>
      ))}
      {[0, Math.round(total / 2), total].map((d) => (
        <text key={d} x={x(d)} y={H - 8} textAnchor="middle" fontSize="9">Day {d}</text>
      ))}
      <line className="ax" x1={PL} y1={PT} x2={PL} y2={H - PB} />
      <polyline className="ideal" points={ideal} />
      <polyline className="ser" points={actual} />
      {actualPts.map((p) => (
        <circle key={p.day} cx={x(p.day)} cy={y(p.actual)} r={4} fill="var(--ai-fill)" />
      ))}
      <line className="gl" x1={x(today)} y1={PT} x2={x(today)} y2={H - PB} stroke="var(--overdue-line)" />
    </svg>
  );
}

/** Velocity goal vs actual per sprint (grouped bars). */
export function VelocityBars({ bars }: { bars: VelocityBar[] }) {
  const W = 460, H = 180, PL = 28, PR = 12, PT = 12, PB = 30;
  const max = Math.max(...bars.map((b) => Math.max(b.goal, b.actual ?? 0))) + 1;
  const groupW = (W - PL - PR) / bars.length;
  const bw = Math.min(26, groupW / 3);
  const y = (v: number) => PT + (1 - v / max) * (H - PT - PB);
  const base = H - PB;

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Velocity goal versus actual per sprint">
      <line className="ax" x1={PL} y1={base} x2={W - PR} y2={base} />
      {bars.map((b, i) => {
        const cx = PL + groupW * i + groupW / 2;
        return (
          <g key={b.sprint}>
            <rect className="bar-n" x={cx - bw - 2} y={y(b.goal)} width={bw} height={base - y(b.goal)} rx={3} />
            <text x={cx - bw / 2 - 2} y={y(b.goal) - 4} textAnchor="middle" fontSize="9">{b.goal}</text>
            {b.actual !== null ? (
              <>
                <rect className="bar-ai" x={cx + 2} y={y(b.actual)} width={bw} height={base - y(b.actual)} rx={3} />
                <text x={cx + bw / 2 + 2} y={y(b.actual) - 4} textAnchor="middle" fontSize="9">{b.actual}</text>
              </>
            ) : (
              <text x={cx + bw / 2 + 2} y={base - 6} textAnchor="middle" fontSize="8" fill="var(--ink-4)">live</text>
            )}
            <text x={cx} y={H - 10} textAnchor="middle" fontSize="9">{b.sprint}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Before → after metric deltas with a directional arrow. */
export function DeltaGrid({ deltas }: { deltas: Delta[] }) {
  return (
    <div className="deltas">
      {deltas.map((d) => (
        <div key={d.label} className="delta">
          <div className="delta-l">{d.label}</div>
          <div className="delta-v">
            <span className="was">{d.before}</span>
            <span className={`arr ${d.improved ? "up" : "down"}`} aria-hidden>→</span>
            <span className={`now ${d.improved ? "good" : "bad"}`}>{d.after}</span>
          </div>
          <div className="delta-s">{d.source}</div>
        </div>
      ))}
    </div>
  );
}

/** Team momentum — cadence + collaboration, team-level only (no leaderboard). */
export function TeamPulseCard({ pulse }: { pulse: TeamPulse }) {
  return (
    <div className="pulse">
      <div className="ct">Team pulse <span className="mut">momentum, not a ranking</span></div>

      <div className="pulse-top">
        <ProgressRing pct={pulse.participationPct} size={62} label="posting" />
        <div className="pulse-stats">
          <div className="pstat">
            <b>{pulse.fresh}/{pulse.expected}</b>
            <span>with work in flight posted since yesterday</span>
          </div>
          <div className="pstat">
            <b>🔥 {pulse.streakDays}</b>
            <span>day update streak</span>
          </div>
        </div>
      </div>

      <div className="badgewall">
        {pulse.badges.map((b) => (
          <span key={b.key} className="bdg"><b>{b.count}×</b> {b.label}</span>
        ))}
      </div>

      <div className="kudosfeed">
        {pulse.kudos.map((k, i) => {
          const from = memberById(k.from), to = memberById(k.to);
          return (
            <div key={i} className="kudo">
              <span className="kudo-h">👏 {from?.name.split(" ")[0]} → {to?.name.split(" ")[0]}{k.itemId ? ` · ${k.itemId.toUpperCase()}` : ""}</span>
              <span className="kudo-m">{k.message}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
