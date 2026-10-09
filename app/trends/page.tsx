"use client";

import { PERSONA, memberById, updatesBy, itemsOwnedBy, code } from "@/lib/data";
import { factsFor } from "@/lib/facts";
import { detect } from "@/lib/detect";
import { todayDay } from "@/lib/demo";
import { useWorld } from "@/lib/useWorld";

export default function TrendsPage() {
  const w = useWorld();
  const me = memberById(PERSONA.member.memberId)!;
  const ups = updatesBy(me.id, w).filter((u) => u.progressText);
  const days = new Set(ups.map((u) => u.sprintDay));
  const today = todayDay();
  const owned = itemsOwnedBy(me.id, w);

  // days I owed an update (I had in-flight work) but none was posted
  const missed = owned.flatMap((i) => factsFor(i, w).missedDays.map((d) => ({ d, item: i })));
  const struggling = owned
    .map((i) => ({ item: i, f: factsFor(i, w) }))
    .filter(({ f }) => f.firstDistress);
  const duringStruggle = missed.filter(({ d, item }) => {
    const f = factsFor(item, w);
    return f.firstDistress && d > f.firstDistress.day && (f.blockedSinceDay === null || d <= f.blockedSinceDay);
  });
  const readAsBlocked = ups.filter((u) => detect([u.progressText, u.blockerText].filter(Boolean).join(" ")).signal).length;

  return (
    <>
      <h1 className="h1">My trends</h1>
      <div className="sub">Your own cadence — visible only to you. No ranking against teammates, never shown to managers.</div>

      <section className="kpis" style={{ marginTop: 16 }}>
        <div className="kpi good"><div className="klab">Days you posted</div><div className="kval">{days.size}/{today}</div></div>
        <div className="kpi"><div className="klab">Updates posted</div><div className="kval">{ups.length}</div></div>
        <div className="kpi risk"><div className="klab">Read as blocked</div><div className="kval">{readAsBlocked}</div></div>
      </section>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="ct">Update streak <span className="mut">Sprint 2</span></div>
        <div className="chips" style={{ marginTop: 10 }}>
          {Array.from({ length: today }, (_, i) => i + 1).map((d) => (
            <span key={d} className={`chip ${days.has(d) ? "ok" : d === today ? "" : "overdue"}`}>Day {d}{d === today && !days.has(d) ? " · today" : ""}</span>
          ))}
        </div>
        {duringStruggle.length > 0 && struggling[0] && (
          <div className="sub" style={{ marginTop: 10 }}>
            Day(s) {duringStruggle.map((x) => x.d).join(", ")} were missed while {code(struggling[0].item)} was hard going (your day-{struggling[0].f.firstDistress!.day} update read as blocked).
            Silence after a struggle is what Beacon now asks you about first — blocked time isn&apos;t held against you.
          </div>
        )}
      </div>
    </>
  );
}
