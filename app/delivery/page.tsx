import Link from "next/link";
import { activeItems, itemById, memberById } from "@/lib/data";
import { StatusPill, TypeTag } from "@/components/ui";

export default function DeliveryPage() {
  const items = activeItems();
  // Dependents of REQ-001 = items that depend on it (directly).
  const root = itemById("req-001")!;
  const dependents = items.filter((i) => i.dependsOn.includes("req-001"));
  const blockers = root.dependsOn.map((d) => itemById(d)).filter(Boolean);

  return (
    <>
      <h1 className="h1">Delivery roll-up</h1>
      <div className="sub">The true status of each deliverable — including the dependency risk Jira&apos;s green roll-up hides.</div>

      <div className="banner bad" style={{ marginTop: 14 }}>
        <div className="bt"><b>REQ-001 rolls up green in Jira, but cannot deliver.</b> Its blocker is open and {dependents.length} item(s) depend on it. A parent is only as done as its blocking children.</div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="ct">{root.id.toUpperCase()} — {root.title}</div>
        <div className="row">
          <div className="nm"><Link href={`/item/${root.id}`} style={{ display: "flex", gap: 8, alignItems: "center" }}><TypeTag item={root} /> {root.title}</Link><small>owner {memberById(root.owner)?.name} · blocker open</small></div>
          <StatusPill status={root.status} />
        </div>

        <div style={{ marginLeft: 20, borderLeft: "2px solid var(--line-strong)", paddingLeft: 14, marginTop: 6 }}>
          <div className="fl" style={{ marginTop: 6 }}>Blocked by</div>
          {blockers.map((b) => b && (
            <div key={b.id} className="row"><div className="nm"><Link href={`/item/${b.id}`} style={{ display: "flex", gap: 8, alignItems: "center" }}><TypeTag item={b} /> {b.title}</Link></div><StatusPill status={b.status} /></div>
          ))}
          <div className="fl" style={{ marginTop: 10 }}>Waiting on it ({dependents.length})</div>
          {dependents.map((d) => (
            <div key={d.id} className="row"><div className="nm"><Link href={`/item/${d.id}`} style={{ display: "flex", gap: 8, alignItems: "center" }}><TypeTag item={d} /> {d.title}</Link></div><StatusPill status={d.status} /></div>
          ))}
        </div>
      </div>
    </>
  );
}
