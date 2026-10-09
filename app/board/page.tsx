"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { activeItems, memberById } from "@/lib/data";
import { attentionScore, byAttention } from "@/lib/priorityScore";
import { Avatar, TypeTag, StatusPill, ScoreReasons } from "@/components/ui";

const FILTERS = [
  { label: "All", q: "/board" },
  { label: "Needs attention", q: "/board?min=70" },
  { label: "Blocked", q: "/board?status=blocked" },
  { label: "Overdue", q: "/board?status=overdue" },
  { label: "Spillover", q: "/board?status=spillover" },
  { label: "Decisions", q: "/board?type=decision" },
];

function BoardInner() {
  const sp = useSearchParams();
  const status = sp.get("status") ?? undefined;
  const type = sp.get("type") ?? undefined;
  const min = sp.get("min") ?? undefined;

  let items = byAttention(activeItems());
  if (status === "spillover") items = items.filter((i) => i.spillover);
  else if (status === "done") items = items.filter((i) => ["done", "confirmed", "resolved"].includes(i.status));
  else if (status) items = items.filter((i) => i.status === status);
  if (type) items = items.filter((i) => i.type === type);
  if (min) items = items.filter((i) => attentionScore(i).value >= Number(min));

  const activeLabel = min
    ? "Needs attention"
    : status
    ? status[0].toUpperCase() + status.slice(1)
    : type
    ? "Decisions"
    : "All";

  return (
    <>
      <h1 className="h1">Priority board</h1>
      <div className="sub">
        Ranked by an explainable attention score — the number is the sum of the reasons beside it, never a black box.
      </div>

      <div className="chips" style={{ marginTop: 14 }}>
        {FILTERS.map((f) => (
          <Link key={f.label} href={f.q} className={`chip${f.label === activeLabel ? " ai" : ""}`}>
            {f.label}
          </Link>
        ))}
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        {items.length === 0 && (
          <div className="state">
            <div className="st">Nothing here</div>
            <div className="sx">No items match this filter in the active sprint.</div>
          </div>
        )}
        {items.map((it) => {
          const owner = memberById(it.owner);
          return (
            <div key={it.id} className="row" style={{ alignItems: "flex-start" }}>
              <Avatar member={owner} />
              <div className="nm">
                <Link href={`/item/${it.id}`} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <TypeTag item={it} /> {it.title} <StatusPill status={it.status} />
                </Link>
                <small>{owner ? owner.name : "Unassigned"} · due {it.dueDate}</small>
                <ScoreReasons score={attentionScore(it)} />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export default function BoardPage() {
  return (
    <Suspense fallback={<div className="sub">Loading board…</div>}>
      <BoardInner />
    </Suspense>
  );
}
