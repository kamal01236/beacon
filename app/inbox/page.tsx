import { items as allItems, itemById, memberById } from "@/lib/data";
import membersJson from "@/data/members.json";
import meetingsJson from "@/data/meetings.json";
import { TypeTag } from "@/components/ui";
import type { Item } from "@/lib/types";

export default function InboxPage() {
  const mtg = (meetingsJson as any[])[0];
  const extracted = (mtg.extractedItems as string[]).map((id) => itemById(id)).filter(Boolean) as Item[];

  return (
    <>
      <h1 className="h1">Meeting inbox</h1>
      <div className="sub">Paste raw notes; Beacon extracts typed, owned, dated items. You confirm — nothing is written to Jira until you do.</div>

      <div className="cols" style={{ marginTop: 16 }}>
        <div className="col">
          <div className="card">
            <div className="ct">{mtg.title} <span className="mut">{mtg.date} · {mtg.duration}m</span></div>
            <div className="sub" style={{ marginTop: 8, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{mtg.rawNotes}</div>
          </div>
        </div>

        <div className="col">
          <div className="ai">
            <div className="aihead">
              <div className="ct">Extracted items</div>
              <span className="conf">cached · {Math.round(mtg.aiExtractionAccuracy.accuracy * 100)}%</span>
            </div>
            <div className="aiout">{extracted.length} items found — {mtg.aiExtractionAccuracy.itemsAcceptedWithoutEdit} accepted without edit in the real meeting.</div>
          </div>

          {extracted.map((it) => {
            const owner = memberById(it.owner);
            return (
              <div key={it.id} className="card" style={{ marginTop: 10 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <TypeTag item={it} />
                  <b style={{ fontSize: "var(--t-body)" }}>{it.title}</b>
                </div>
                <div className="sub" style={{ marginTop: 6 }}>Owner: {owner?.name ?? "unassigned"} · due {it.dueDate}</div>
                <div className="btnrow" style={{ marginTop: 10 }}>
                  <button className="btn p sm" type="button">Confirm</button>
                  <button className="btn s sm" type="button">Edit</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
