"use client";

import Link from "next/link";
import { Fragment, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { activeItems, memberById, isDone } from "@/lib/data";
import { attentionScore, byAttention, RULES, ATTENTION_THRESHOLD } from "@/lib/priorityScore";
import { useWorld } from "@/lib/useWorld";
import { Avatar, TypeTag, StatusPill, ScoreReasons } from "@/components/ui";

const FILTERS = [
  { label: "All", q: "/board" },
  { label: "Needs attention", q: `/board?min=${ATTENTION_THRESHOLD}` },
  { label: "Blocked", q: "/board?status=blocked" },
  { label: "Overdue", q: "/board?status=overdue" },
  { label: "Spillover", q: "/board?status=spillover" },
  { label: "Decisions", q: "/board?type=decision" },
];

function BoardInner() {
  const w = useWorld();
  const sp = useSearchParams();
  const status = sp.get("status") ?? undefined;
  const type = sp.get("type") ?? undefined;
  const min = sp.get("min") ?? undefined;

  let items = byAttention(activeItems(w), w);
  if (status === "spillover") items = items.filter((i) => i.spillover && !isDone(i));
  else if (status === "done") items = items.filter(isDone);
  else if (status) items = items.filter((i) => i.status === status);
  if (type) items = items.filter((i) => i.type === type);
  if (min) items = items.filter((i) => attentionScore(i, w).value >= Number(min));

  const activeLabel = min
    ? "Needs attention"
    : status
    ? status[0].toUpperCase() + status.slice(1).replace("_", " ")
    : type
    ? "Decisions"
    : "All";

  return (
    <>
      <h1 className="h1">Priority board</h1>
      <div className="sub">
        Ranked by an explainable attention score — computed from the item&apos;s facts, and always the sum of the reasons beside it.
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
                <ScoreReasons score={attentionScore(it, w)} />
              </div>
            </div>
          );
        })}
      </div>

      <details className="card" style={{ marginTop: 14 }}>
        <summary className="ct" style={{ cursor: "pointer" }}>How scoring works <span className="mut">{RULES.length} rules · needs attention at {ATTENTION_THRESHOLD}+</span></summary>
        <div className="rules">
          {RULES.map((r) => (
            <Fragment key={r.key}><b>{r.name}</b><span>{r.how}</span></Fragment>
          ))}
        </div>
        <div className="sub" style={{ marginTop: 10 }}>Done items score 0. Weights are team-tunable in the live product; every point on the board traces to one of these rules.</div>
      </details>
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
