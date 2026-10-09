import Link from "next/link";
import { PERSONA, memberById, itemsOwnedBy, progressFor, updatesBy } from "@/lib/data";
import { attentionScore } from "@/lib/priorityScore";
import { TypeTag, StatusPill } from "@/components/ui";

export default function MyWorkPage() {
  const me = memberById(PERSONA.member.memberId)!;
  const owned = itemsOwnedBy(me.id);
  const ups = updatesBy(me.id);
  const blocked = owned.filter((i) => i.status === "blocked");

  return (
    <>
      <h1 className="h1">Good morning, {me.name.split(" ")[0]}</h1>
      <div className="sub">{owned.length} item(s) assigned · {blocked.length} blocked</div>

      <div className="banner bad" style={{ marginTop: 14 }}>
        <div className="bt"><b>Sarah requested an update on REQ-001.</b> It&apos;s your top item and it&apos;s blocked — add today&apos;s update or ask for help.</div>
        <div className="btnrow"><Link className="btn d sm" href="/get-help">Get help</Link></div>
      </div>

      <section className="kpis" style={{ marginTop: 16 }}>
        <div className="kpi"><div className="klab">My items</div><div className="kval">{owned.length}</div></div>
        <div className="kpi bad"><div className="klab">Blocked</div><div className="kval">{blocked.length}</div></div>
        <div className="kpi good"><div className="klab">Updates on time</div><div className="kval">{ups.filter((u) => u.submittedOnTime).length}</div></div>
        <div className="kpi"><div className="klab">My points</div><div className="kval">{me.points}</div></div>
      </section>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="ct">My items <span className="mut">update or get help</span></div>
        {owned.map((it) => (
          <div key={it.id} className="row" style={{ alignItems: "flex-start" }}>
            <div className="nm">
              <Link href={`/item/${it.id}`} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <TypeTag item={it} /> {it.title} <StatusPill status={it.status} />
              </Link>
              <div className="barlab" style={{ marginTop: 6 }}><span>Progress · attention {attentionScore(it).value}</span><span>{progressFor(it)}%</span></div>
              <div className="bar"><i className={it.status === "blocked" ? "bad" : it.status === "spillover" ? "warn" : ""} style={{ width: `${progressFor(it)}%` }} /></div>
            </div>
            <div className="btnrow">
              {it.status === "blocked" && <Link className="btn s sm" href="/get-help">Get help</Link>}
              <Link className="btn p sm" href={`/item/${it.id}`}>Update</Link>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
