import Link from "next/link";
import { members, itemsOwnedBy, latestUpdateBy, activeSprint } from "@/lib/data";
import { sprintDay } from "@/lib/demo";
import { Avatar } from "@/components/ui";

export default function PeoplePage() {
  const day = sprintDay(activeSprint.startDate);
  const updatedToday = members.filter((m) => {
    const u = latestUpdateBy(m.id);
    return u && u.sprintDay >= day - 1;
  });

  return (
    <>
      <h1 className="h1">Team status — today</h1>
      <div className="sub">Who has updated, what each person owns, and where help is needed.</div>

      <div className="lens" aria-label="People views" style={{ marginBottom: 4 }}>
        <span className="on" aria-current="page">Today</span>
        <Link href="/delivery">Capacity &amp; next sprint</Link>
      </div>

      <div className="card" style={{ marginTop: 10, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <span className="score lo" style={{ fontSize: 22 }}>{updatedToday.length} / {members.length}</span>
        <span className="sub" style={{ marginTop: 0 }}>updated for today&apos;s stand-up — stragglers nudged automatically</span>
      </div>

      <div className="grid" style={{ marginTop: 14 }}>
        {members.map((m) => {
          const owned = itemsOwnedBy(m.id);
          const blocked = owned.filter((i) => i.status === "blocked").length;
          const spill = owned.filter((i) => i.spillover).length;
          const done = owned.filter((i) => ["done", "confirmed", "resolved"].includes(i.status)).length;
          const u = latestUpdateBy(m.id);
          const fresh = u && u.sprintDay >= day - 1;
          return (
            <Link key={m.id} className="card" href={`/people/${m.id}`}>
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <Avatar member={m} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-4)", fontWeight: 600 }}>{m.role}</div>
                </div>
                <span className={`chip ${fresh ? "ok" : "overdue"}`}>{fresh ? "Updated" : "No update"}</span>
              </div>
              <div className="chips" style={{ marginTop: 12 }}>
                <span className="chip">{owned.length} item{owned.length === 1 ? "" : "s"}</span>
                {blocked > 0 && <span className="chip blocked">{blocked} blocked</span>}
                {spill > 0 && <span className="chip spill">{spill} spillover</span>}
                {done > 0 && <span className="chip ok">{done} done</span>}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 13, paddingTop: 12, borderTop: "1px solid #F0F3F7" }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "var(--ai)" }}>{m.points} pts</span>
                <span className="drill" style={{ margin: 0 }}>Open detail →</span>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
