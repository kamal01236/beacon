import Link from "next/link";
import { notFound } from "next/navigation";
import {
  memberById, itemsOwnedBy, progressFor, updatesBy, kudosFor, itemById, activeSprint,
} from "@/lib/data";
import { sprintDay } from "@/lib/demo";
import { attentionScore } from "@/lib/priorityScore";
import { Avatar, TypeTag, StatusPill, ScoreReasons, Crumb, AiBlock } from "@/components/ui";
import { members } from "@/lib/data";

// Pre-render every member page (required for static export; harmless otherwise).
export function generateStaticParams() {
  return members.map((m) => ({ memberId: m.id }));
}

export default function MemberDetailPage({ params }: { params: { memberId: string } }) {
  const m = memberById(params.memberId);
  if (!m) notFound();

  const day = sprintDay(activeSprint.startDate);
  const owned = itemsOwnedBy(m.id);
  const blocked = owned.filter((i) => i.status === "blocked");
  const spill = owned.filter((i) => i.spillover);
  const done = owned.filter((i) => ["done", "confirmed", "resolved"].includes(i.status));
  const ups = updatesBy(m.id);
  const yesterday = ups.find((u) => u.sprintDay === day - 1) ?? ups[1];
  const todayU = ups.find((u) => u.sprintDay === day) ?? ups[0];
  const { received, given } = kudosFor(m.id);
  const staleItem = owned.find((i) => i.spillover || i.status === "overdue");
  const onTime = ups.filter((u) => u.submittedOnTime).length;

  return (
    <>
      <Crumb href="/people" label="Team status" />

      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <Avatar member={m} size="lg" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="h1">{m.name}</h1>
          <div className="sub">{m.role} · Member · {m.points} pts this sprint</div>
        </div>
        <div className="chips" style={{ alignItems: "center" }}>
          {todayU ? <span className="chip ok">Updated · day {todayU.sprintDay}</span> : <span className="chip overdue">No update today</span>}
          {staleItem && <span className="chip overdue">1 update pending</span>}
          <Link className="btn p sm" href="/inbox">Request update</Link>
        </div>
      </div>

      {staleItem && (
        <div className="banner warn" style={{ marginTop: 14 }}>
          <div className="bt">
            <b>{staleItem.id.toUpperCase()} has no fresh update.</b> Updates are expected daily by
            11:00; Beacon auto-nudged {m.name.split(" ")[0]} and flagged it for your follow-up.
            Requesting an update marks the item <i>awaiting update</i> until they respond.
          </div>
          <div className="btnrow"><Link className="btn d sm" href="/inbox">Request update on {staleItem.id.toUpperCase()}</Link></div>
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <AiBlock
          title={`AI daily summary — ${m.name.split(" ")[0]}, Day ${day}`}
          confidence={90}
          cite={`Drawn from: ${ups.length} update(s) this sprint · ${owned.length} owned item(s) · collaboration log`}
        >
          {blocked.length > 0 ? (
            <>
              {m.name.split(" ")[0]} is working through <b>{blocked.map((b) => b.id.toUpperCase()).join(", ")}</b>
              {blocked[0].blocker ? <> — {blocked[0].blocker.toLowerCase()}</> : null}.{" "}
            </>
          ) : (
            <>{m.name.split(" ")[0]} has no blocked items. </>
          )}
          {spill.length > 0 && <>Carrying <b>{spill.length} spillover</b> item(s) — the main risk on their plate. </>}
          {given.length > 0 && <>Gave help on <b>{given.map((k) => (k.itemId ? k.itemId.toUpperCase() : "a teammate's work")).join(", ")}</b>.</>}
        </AiBlock>
      </div>

      <div className="cols" style={{ marginTop: 16 }}>
        <div className="col">
          {/* the member's own stand-up, from their real updates */}
          {(yesterday || todayU) && (
            <div className="card">
              <div className="ct">Stand-up <span className="mut">from {m.name.split(" ")[0]}&apos;s updates</span></div>
              <div className="grid" style={{ marginTop: 12 }}>
                <div className="card" style={{ background: "var(--surface-2)", boxShadow: "none" }}>
                  <div className="fl">Yesterday</div>
                  <div className="sub" style={{ marginTop: 4 }}>{yesterday ? yesterday.progressText : "—"}</div>
                </div>
                <div className="card" style={{ background: "var(--ai-tint)", borderColor: "var(--ai-line)", boxShadow: "none" }}>
                  <div className="fl" style={{ color: "var(--ai)" }}>Today</div>
                  <div className="sub" style={{ marginTop: 4 }}>{todayU ? todayU.progressText : "—"}</div>
                </div>
                <div className="card" style={{ background: "var(--surface-2)", boxShadow: "none" }}>
                  <div className="fl">Next</div>
                  <div className="sub" style={{ marginTop: 4 }}>{(todayU ?? yesterday)?.nextAction ?? "—"}</div>
                </div>
              </div>
            </div>
          )}

          {/* everything assigned */}
          <div className="card">
            <div className="ct">Assigned items <span className="mut">tap any item for its full history</span></div>
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
                    <ScoreReasons score={attentionScore(it)} showSum={false} />
                  </div>
                </Link>
              ))}
              {owned.length === 0 && <div className="sub">No items assigned in the active sprint.</div>}
            </div>
          </div>
        </div>

        <div className="col narrow">
          {/* collaboration, from real kudos cross-links */}
          <div className="card">
            <div className="ct">Collaboration <span className="mut">this sprint</span></div>
            {given.map((k) => {
              const to = memberById(k.to);
              const it = k.itemId ? itemById(k.itemId) : undefined;
              return (
                <div key={k.id} className="row" style={{ alignItems: "flex-start" }}>
                  <span className="type action" style={{ marginTop: 1 }}>Helped</span>
                  <div className="nm"><b>{to?.name ?? "a teammate"}</b>{it ? <> on <b>{it.id.toUpperCase()}</b></> : null}<small>{k.message.slice(0, 80)}…</small></div>
                </div>
              );
            })}
            {received.map((k) => {
              const from = memberById(k.from);
              const it = k.itemId ? itemById(k.itemId) : undefined;
              return (
                <div key={k.id} className="row" style={{ alignItems: "flex-start" }}>
                  <span className="type requirement" style={{ marginTop: 1 }}>Helped by</span>
                  <div className="nm"><b>{from?.name ?? "a teammate"}</b>{it ? <> on <b>{it.id.toUpperCase()}</b></> : null}<small>{k.message.slice(0, 80)}…</small></div>
                </div>
              );
            })}
            {given.length === 0 && received.length === 0 && <div className="sub">No recorded collaboration yet this sprint.</div>}
          </div>

          {/* cadence + contribution log, from real updates */}
          <div className="card">
            <div className="ct">Update cadence</div>
            <div className="sub" style={{ marginTop: 2 }}>Daily by 11:00 · {onTime} of {ups.length} on time this sprint</div>
            <div className="ct" style={{ marginTop: 14 }}>Contribution log <span className="mut">recorded for retro</span></div>
            {ups.slice(0, 6).map((u) => (
              <div key={u.id} className="row">
                <span style={{ fontSize: 10, fontWeight: 800, color: "var(--ink-4)", flex: "0 0 46px" }}>DAY {u.sprintDay}</span>
                <div className="nm" style={{ fontWeight: 500 }}>{u.progressText}{u.blockerSignal ? <span className="drill" style={{ margin: 0 }}> · blocker signal</span> : null}</div>
              </div>
            ))}
            <div className="drill">Open any item above to see its full resolution trail.</div>
          </div>
        </div>
      </div>
    </>
  );
}
