"use client";

import Link from "next/link";
import { memberById, itemsOwnedBy, progressFor, updatesBy, kudosFor, itemById, code, isDone } from "@/lib/data";
import { todayDay } from "@/lib/demo";
import { attentionScore, byAttention } from "@/lib/priorityScore";
import { factsFor } from "@/lib/facts";
import { detect } from "@/lib/detect";
import { getRequests } from "@/lib/agent";
import { useActor, useWorld } from "@/lib/useWorld";
import { Avatar, TypeTag, StatusPill, ScoreReasons, Crumb, AiBlock } from "@/components/ui";
import { RequestCard } from "@/components/hic";
import { TeamOnlyNote } from "@/components/privacy";

export function MemberDetail({ memberId }: { memberId: string }) {
  const w = useWorld();
  const { role } = useActor();
  const m = memberById(memberId)!;
  if (role === "manager") return (<><Crumb href="/manager" label="Team view" /><h1 className="h1">{m.name}</h1><TeamOnlyNote /></>);

  const day = todayDay();
  const owned = byAttention(itemsOwnedBy(m.id, w), w);
  const open = owned.filter((i) => !isDone(i));
  const blocked = owned.filter((i) => factsFor(i, w).blocked);
  const spill = owned.filter((i) => i.spillover && !isDone(i));
  const done = owned.filter(isDone);
  const ups = updatesBy(m.id, w).filter((u) => u.progressText);
  const latest = ups[0];
  const previous = ups.find((u) => u.sprintDay < (latest?.sprintDay ?? 0));
  const { received, given } = kudosFor(m.id);
  const requests = getRequests(w).filter((r) => r.toMemberId === m.id);
  const fresh = latest && latest.sprintDay >= day - 1;

  const first = m.name.split(" ")[0];
  const summary = [
    blocked.length ? `${first} is blocked on ${blocked.map(code).join(", ")}${blocked[0].blocker ? ` — ${blocked[0].blocker.replace(/\.$/, "")}` : ""}.` : `${first} has no blocked items.`,
    spill.length ? `Carrying ${spill.length} spillover item(s) (${spill.map(code).join(", ")}).` : "",
    requests.length ? `The agent is waiting on ${requests.length} answer(s) from ${first}.` : "",
    given.length ? `Helped on ${given.map((k) => (k.itemId ? code(k.itemId) : "a teammate's work")).join(", ")}.` : "",
  ].filter(Boolean).join(" ");

  return (
    <>
      <Crumb href="/people" label="Team status" />

      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <Avatar member={m} size="lg" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="h1">{m.name}</h1>
          <div className="sub">{m.role} · {open.length} open item(s)</div>
        </div>
        <div className="chips" style={{ alignItems: "center" }}>
          {fresh ? <span className="chip ok">Posted · day {latest!.sprintDay}</span> : <span className="chip overdue">No update since {latest ? `day ${latest.sprintDay}` : "sprint start"}</span>}
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <AiBlock title={`Summary — ${first}, Day ${day}`} cite={`Built from: ${ups.length} update(s) this sprint · ${owned.length} owned item(s) · kudos log`}>
          {summary}
        </AiBlock>
      </div>

      {requests.map((r) => <RequestCard key={r.id} r={r} w={w} item={itemById(r.itemId, w)!} />)}

      <div className="cols" style={{ marginTop: 16 }}>
        <div className="col">
          {latest && (
            <div className="card">
              <div className="ct">Stand-up <span className="mut">from {first}&apos;s own updates</span></div>
              <div className="grid" style={{ marginTop: 12 }}>
                <div className="card" style={{ background: "var(--surface-2)", boxShadow: "none" }}>
                  <div className="fl">Before · day {previous?.sprintDay ?? "—"}</div>
                  <div className="sub" style={{ marginTop: 4 }}>{previous?.progressText ?? "—"}</div>
                </div>
                <div className="card" style={{ background: "var(--ai-tint)", borderColor: "var(--ai-line)", boxShadow: "none" }}>
                  <div className="fl" style={{ color: "var(--ai)" }}>Latest · day {latest.sprintDay}</div>
                  <div className="sub" style={{ marginTop: 4 }}>{latest.progressText}</div>
                </div>
                <div className="card" style={{ background: "var(--surface-2)", boxShadow: "none" }}>
                  <div className="fl">Next</div>
                  <div className="sub" style={{ marginTop: 4 }}>{latest.nextAction ?? "—"}</div>
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <div className="ct">Assigned items <span className="mut">ranked by attention</span></div>
            <div className="kpis" style={{ marginTop: 12 }}>
              <div className="kpi"><div className="klab">Assigned</div><div className="kval">{owned.length}</div></div>
              <div className="kpi good"><div className="klab">Done</div><div className="kval">{done.length}</div></div>
              <div className="kpi bad"><div className="klab">Blocked</div><div className="kval">{blocked.length}</div></div>
              <div className="kpi risk"><div className="klab">Spillover</div><div className="kval">{spill.length}</div></div>
            </div>
            <div style={{ marginTop: 6 }}>
              {owned.map((it) => (
                <Link key={it.id} className="row" href={`/item/${it.id}`} style={{ alignItems: "flex-start" }}>
                  <div className="nm">
                    <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <TypeTag item={it} /> {it.title} <StatusPill status={it.status} />
                    </span>
                    <div className="barlab" style={{ marginTop: 6 }}><span>Progress</span><span>{progressFor(it)}%</span></div>
                    <div className="bar"><i className={it.status === "blocked" ? "bad" : it.status === "spillover" ? "warn" : ""} style={{ width: `${progressFor(it)}%` }} /></div>
                    <ScoreReasons score={attentionScore(it, w)} showSum={false} />
                  </div>
                </Link>
              ))}
              {owned.length === 0 && <div className="sub">No items assigned in the active sprint.</div>}
            </div>
          </div>
        </div>

        <div className="col narrow">
          <div className="card">
            <div className="ct">Collaboration <span className="mut">this sprint</span></div>
            {given.map((k) => {
              const to = memberById(k.to);
              return (
                <div key={k.id} className="row" style={{ alignItems: "flex-start" }}>
                  <span className="type action" style={{ marginTop: 1 }}>Helped</span>
                  <div className="nm"><b>{to?.name ?? "a teammate"}</b>{k.itemId ? <> on <b>{code(k.itemId)}</b></> : null}<small>{k.message.slice(0, 80)}…</small></div>
                </div>
              );
            })}
            {received.map((k) => {
              const from = memberById(k.from);
              return (
                <div key={k.id} className="row" style={{ alignItems: "flex-start" }}>
                  <span className="type requirement" style={{ marginTop: 1 }}>Helped by</span>
                  <div className="nm"><b>{from?.name ?? "a teammate"}</b>{k.itemId ? <> on <b>{code(k.itemId)}</b></> : null}<small>{k.message.slice(0, 80)}…</small></div>
                </div>
              );
            })}
            {given.length === 0 && received.length === 0 && <div className="sub">No recorded collaboration yet this sprint.</div>}
          </div>

          <div className="card">
            <div className="ct">Update log <span className="mut">recorded for retro</span></div>
            {ups.slice(0, 6).map((u) => (
              <div key={u.id} className="row">
                <span style={{ fontSize: 10, fontWeight: 800, color: "var(--ink-4)", flex: "0 0 46px" }}>DAY {u.sprintDay}</span>
                <div className="nm" style={{ fontWeight: 500 }}>
                  {u.progressText}
                  {detect([u.progressText, u.blockerText].filter(Boolean).join(" ")).signal && <span className="drill" style={{ margin: 0 }}> · read as blocked</span>}
                </div>
              </div>
            ))}
            {ups.length === 0 && <div className="sub">No updates posted this sprint.</div>}
          </div>
        </div>
      </div>
    </>
  );
}
