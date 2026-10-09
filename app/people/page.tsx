"use client";

import Link from "next/link";
import { members, itemsOwnedBy, isDone } from "@/lib/data";
import { participation } from "@/lib/insights";
import { useActor, useWorld } from "@/lib/useWorld";
import { Avatar } from "@/components/ui";
import { TeamOnlyNote } from "@/components/privacy";

export default function PeoplePage() {
  const w = useWorld();
  const { role } = useActor();
  if (role === "manager") return (<><h1 className="h1">Team status</h1><TeamOnlyNote /></>);

  const p = participation(w);
  const quiet = new Set(p.quiet.map((m) => m.id));

  return (
    <>
      <h1 className="h1">Team status — today</h1>
      <div className="sub">Who has work in flight, who has posted, and where help is needed. No scores, no ranking.</div>

      <div className="card" style={{ marginTop: 14, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <span className="score lo" style={{ fontSize: 22 }}>{p.freshCount} / {p.expected}</span>
        <span className="sub" style={{ marginTop: 0 }}>people with work in flight have posted since yesterday — the agent asks anyone who goes quiet</span>
      </div>

      <div className="grid" style={{ marginTop: 14 }}>
        {members.map((m) => {
          const owned = itemsOwnedBy(m.id, w);
          const blocked = owned.filter((i) => i.status === "blocked").length;
          const spill = owned.filter((i) => i.spillover && !isDone(i)).length;
          const done = owned.filter(isDone).length;
          const inFlight = owned.some((i) => ["in_progress", "blocked", "spillover"].includes(i.status));
          return (
            <Link key={m.id} className="card" href={`/people/${m.id}`}>
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <Avatar member={m} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-4)", fontWeight: 600 }}>{m.role}</div>
                </div>
                {inFlight
                  ? <span className={`chip ${quiet.has(m.id) ? "overdue" : "ok"}`}>{quiet.has(m.id) ? "No update" : "Updated"}</span>
                  : <span className="chip">Nothing in flight</span>}
              </div>
              <div className="chips" style={{ marginTop: 12 }}>
                <span className="chip">{owned.length} item{owned.length === 1 ? "" : "s"}</span>
                {blocked > 0 && <span className="chip blocked">{blocked} blocked</span>}
                {spill > 0 && <span className="chip spill">{spill} spillover</span>}
                {done > 0 && <span className="chip ok">{done} done</span>}
              </div>
              <div className="drill" style={{ marginTop: 12 }}>Open detail →</div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
