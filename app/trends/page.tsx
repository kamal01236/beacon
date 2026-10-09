import { PERSONA, memberById, updatesBy } from "@/lib/data";

export default function TrendsPage() {
  const me = memberById(PERSONA.member.memberId)!;
  const ups = updatesBy(me.id);
  const onTime = ups.filter((u) => u.submittedOnTime).length;
  const structured = ups.filter((u) => u.aiStructured).length;

  return (
    <>
      <h1 className="h1">My trends</h1>
      <div className="sub">Your own cadence and update quality — visible only to you. No ranking against teammates.</div>

      <section className="kpis" style={{ marginTop: 16 }}>
        <div className="kpi good"><div className="klab">Updates on time</div><div className="kval">{onTime}/{ups.length}</div></div>
        <div className="kpi"><div className="klab">AI-structured</div><div className="kval">{structured}</div></div>
        <div className="kpi"><div className="klab">My points</div><div className="kval">{me.points}</div></div>
      </section>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="ct">Update streak</div>
        <div className="chips" style={{ marginTop: 10 }}>
          {ups.slice().reverse().map((u) => (
            <span key={u.id} className={`chip ${u.submittedOnTime ? "ok" : "overdue"}`}>Day {u.sprintDay}</span>
          ))}
        </div>
        <div className="sub" style={{ marginTop: 10 }}>Missed days were while you were blocked — the nudge fired and your lead followed up. Blocked time isn&apos;t held against you.</div>
      </div>
    </>
  );
}
