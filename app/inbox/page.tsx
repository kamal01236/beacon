"use client";

import Link from "next/link";
import { itemById, memberById, firstName } from "@/lib/data";
import meetingsJson from "@/data/meetings.json";
import { useWorld } from "@/lib/useWorld";
import { TypeTag, StatusPill } from "@/components/ui";
import type { Item } from "@/lib/types";

interface Meeting {
  title: string;
  date: string;
  duration: number;
  rawNotes: string;
  extractedItems: string[];
  extractionConfirmedBy?: string;
  extractionConfirmedDate?: string;
  aiExtractionAccuracy: { itemsExtracted: number; itemsAcceptedWithoutEdit: number; itemsEdited: number; itemsRejected: number };
}

export default function InboxPage() {
  const w = useWorld();
  const mtg = (meetingsJson as unknown as Meeting[])[0];
  const extracted = mtg.extractedItems.map((id) => itemById(id, w)).filter(Boolean) as Item[];
  const acc = mtg.aiExtractionAccuracy;

  return (
    <>
      <h1 className="h1">Meeting inbox</h1>
      <div className="sub">Raw notes in, typed and owned items out — confirmed by a person before anything reaches the tracker.</div>

      <div className="banner warn" style={{ marginTop: 14 }}>
        <div className="bt">
          <b>Prototype:</b> this shows a recorded extraction from the Apex meeting on {mtg.date}. Extracting from newly pasted notes
          needs the language model and arrives with the live agent (README → Roadmap, phase 3).
        </div>
      </div>

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
              <span className="conf fact">recorded</span>
            </div>
            <div className="aiout">
              {acc.itemsExtracted} items extracted; {acc.itemsAcceptedWithoutEdit} accepted without edit, {acc.itemsEdited} edited, {acc.itemsRejected} rejected
              {mtg.extractionConfirmedBy ? ` — confirmed by ${firstName(mtg.extractionConfirmedBy)}${mtg.extractionConfirmedDate ? ` on ${mtg.extractionConfirmedDate}` : ""}` : ""}.
            </div>
          </div>

          {extracted.map((it) => {
            const owner = memberById(it.owner);
            return (
              <Link key={it.id} href={`/item/${it.id}`} className="card" style={{ marginTop: 10, display: "block" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <TypeTag item={it} />
                  <b style={{ fontSize: "var(--t-body)" }}>{it.title}</b>
                  <StatusPill status={it.status} />
                </div>
                <div className="sub" style={{ marginTop: 6 }}>Owner: {owner?.name ?? "unassigned"} · due {it.dueDate} · in the tracker now</div>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
