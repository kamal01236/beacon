"use client";

import Link from "next/link";
import { memberById, code } from "@/lib/data";
import { rollup } from "@/lib/insights";
import { useWorld } from "@/lib/useWorld";
import { StatusPill, TypeTag } from "@/components/ui";

export default function DeliveryPage() {
  const w = useWorld();
  const rows = rollup(w);
  const hiddenRisk = rows.filter((r) => r.beaconSays !== "Blocked");

  return (
    <>
      <h1 className="h1">Delivery roll-up</h1>
      <div className="sub">Each item&apos;s real delivery state next to what its own status says — computed from blockers, dependency links and update wording.</div>

      {rows.length === 0 ? (
        <div className="banner ai" style={{ marginTop: 14 }}><div className="bt"><b>Nothing is blocked or held up by a dependency.</b></div></div>
      ) : (
        <div className="banner bad" style={{ marginTop: 14 }}>
          <div className="bt">
            <b>{rows.length} item(s) cannot deliver as things stand.</b>{" "}
            {hiddenRisk.length > 0 && <>{hiddenRisk.length} of them look fine in the tracker ({hiddenRisk.map((r) => `${code(r.item)} says "${r.trackerSays}"`).join(", ")}). A parent is only as done as what it waits on.</>}
          </div>
        </div>
      )}

      {rows.map((r) => (
        <div key={r.item.id} className="card" style={{ marginTop: 14 }}>
          <div className="row" style={{ borderTop: 0 }}>
            <div className="nm">
              <Link href={`/item/${r.item.id}`} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <TypeTag item={r.item} /> {r.item.title}
              </Link>
              <small>owner {memberById(r.item.owner)?.name ?? "unassigned"} · {r.because}</small>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
              <span className="stamp">Tracker says <StatusPill status={r.item.status} /></span>
              <span className={`pill ${r.beaconSays === "At risk" ? "a" : "r"}`}>Beacon: {r.beaconSays}</span>
            </div>
          </div>
          {(r.blockedBy.length > 0 || r.waiting.length > 0) && (
            <div style={{ marginLeft: 20, borderLeft: "2px solid var(--line-strong)", paddingLeft: 14, marginTop: 6 }}>
              {r.blockedBy.length > 0 && <div className="fl" style={{ marginTop: 6 }}>Held up by</div>}
              {r.blockedBy.map((b) => (
                <div key={b.id} className="row"><div className="nm"><Link href={`/item/${b.id}`} style={{ display: "flex", gap: 8, alignItems: "center" }}><TypeTag item={b} /> {b.title}</Link></div><StatusPill status={b.status} /></div>
              ))}
              {r.waiting.length > 0 && <div className="fl" style={{ marginTop: 10 }}>Waiting on it ({r.waiting.length})</div>}
              {r.waiting.map((d) => (
                <div key={d.id} className="row"><div className="nm"><Link href={`/item/${d.id}`} style={{ display: "flex", gap: 8, alignItems: "center" }}><TypeTag item={d} /> {d.title}</Link></div><StatusPill status={d.status} /></div>
              ))}
            </div>
          )}
        </div>
      ))}
    </>
  );
}
