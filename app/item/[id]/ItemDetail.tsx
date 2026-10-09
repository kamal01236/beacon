"use client";

import Link from "next/link";
import { itemById, memberById, updatesForItem, storyForItem, progressFor, code, firstName } from "@/lib/data";
import { daysFromToday } from "@/lib/demo";
import { attentionScore } from "@/lib/priorityScore";
import { factsFor } from "@/lib/facts";
import { detect, THRESHOLD } from "@/lib/detect";
import { getRequests, getSignals, kbFor, helperFor } from "@/lib/agent";
import { useActor, useWorld } from "@/lib/useWorld";
import { Avatar, StatusPill, ScoreReasons, Crumb, AiBlock } from "@/components/ui";
import { Feedback, RequestCard, SignalCard, UpdateForm } from "@/components/hic";

export function ItemDetail({ id }: { id: string }) {
  const w = useWorld();
  const { memberId, canAct } = useActor();
  const item = itemById(id, w)!;
  const f = factsFor(item, w);
  const owner = memberById(item.owner);
  const ups = updatesForItem(item.id, w);
  const posted = ups.filter((u) => u.author && u.progressText);
  const story = storyForItem(item.id);
  const score = attentionScore(item, w);
  const signals = getSignals(w).filter((s) => s.itemId === item.id);
  const requests = getRequests(w).filter((r) => r.itemId === item.id);
  const kb = kbFor(item, w);
  const helper = helperFor(item, w);
  const due = daysFromToday(item.dueDate);
  const dueLabel = due === 0 ? "due today" : due < 0 ? `${-due}d past due` : `due in ${due}d`;
  const isOwner = canAct && item.owner === memberId;
  const status = item.status.replace("_", " ");

  let summary: string;
  if (f.done) summary = `Done. ${posted.length} update(s) logged.`;
  else if (f.blocked) {
    const late = f.firstDistress && f.blockedSinceDay !== null && f.blockedSinceDay > f.firstDistress.day;
    summary = [
      `Blocked for ${f.blockedDays} day(s)${f.dependents.length ? `; ${f.dependents.map(code).join(", ")} waits on it` : ""}.`,
      late ? `The wording read as blocked on day ${f.firstDistress!.day}, ${f.blockedSinceDay! - f.firstDistress!.day} day(s) before it was raised.` : "",
      helper?.alreadyPairing ? `${helper.member.name.split(" ")[0]} is pairing on it.` : "",
    ].filter(Boolean).join(" ");
  } else if (f.blockedUpstream.length) summary = `Shows "${status}" but cannot deliver until ${f.blockedUpstream.map(code).join(", ")} unblocks.`;
  else if (f.languageNow) summary = `The day-${f.languageNow.day} update reads as blocked (${f.languageNow.detection.hits.map((h) => h.phrase).join(", ")}), but no blocker is raised.`;
  else if (f.overdueDays) summary = `${f.overdueDays} day(s) past due${item.status !== "overdue" ? `, while the status still says "${status}"` : ""}.`;
  else summary = `On track. ${posted.length} update(s) logged${f.lastUpdateDay ? `, last on day ${f.lastUpdateDay}` : ""}.`;

  const showHelp = !f.done && (f.blocked || !!f.languageNow);

  return (
    <>
      <Crumb href="/board" label="Priority board" />

      <div className="hero">
        <div className="hid">{code(item)} · {item.type}</div>
        <div className="ht">{item.title}</div>
        <div className="hmeta">
          <StatusPill status={item.status} />
          {owner && <span className="chip" style={{ background: "var(--navy-3)", color: "var(--on-navy)" }}>{owner.name}</span>}
          <span className="chip" style={{ background: "var(--navy-3)", color: "var(--on-navy)" }}>{dueLabel}</span>
          <span className="chip" style={{ background: "var(--navy-3)", color: "var(--on-navy)" }}>attention {score.value}</span>
        </div>
      </div>

      <div className="cols" style={{ marginTop: 16 }}>
        <div className="col">
          {requests.map((r) => <RequestCard key={r.id} r={r} w={w} item={item} />)}

          <div className="card">
            <div className="ct">Context</div>
            <div className="sub" style={{ marginTop: 6 }}>{item.description}</div>
            <div className="barlab" style={{ marginTop: 12 }}><span>Progress (from status)</span><span>{progressFor(item)}%</span></div>
            <div className="bar"><i className={item.status === "blocked" ? "bad" : item.status === "spillover" ? "warn" : ""} style={{ width: `${progressFor(item)}%` }} /></div>
            <div className="chips" style={{ marginTop: 12 }}>
              <span className="chip">Priority: {item.priority}</span>
              {item.clientImpact && <span className="chip overdue">Client impact</span>}
              {item.dependsOn.map((d) => <Link key={d} className="chip" href={`/item/${d}`}>depends on {code(d)}</Link>)}
              {f.dependents.map((d) => <Link key={d.id} className="chip blocked" href={`/item/${d.id}`}>{code(d)} waits on this</Link>)}
            </div>
          </div>

          {item.blocker && (
            <div className="banner bad">
              <div className="bt"><b>Blocker:</b> {item.blocker}</div>
            </div>
          )}

          <div className="card">
            <div className="ct">Why it ranks here <span className="mut">attention = sum of rule-based reasons</span></div>
            <div style={{ marginTop: 8 }}><ScoreReasons score={score} /></div>
            <Link className="drill" href="/board">See all scoring rules on the board →</Link>
          </div>

          {signals.length > 0 && <h2 className="h2">What the agent found</h2>}
          {signals.map((s) => <SignalCard key={s.id} s={s} w={w} />)}

          <div className="card">
            <div className="ct">Activity timeline <span className="mut">each update is language-checked</span></div>
            {ups.length === 0 && <div className="sub" style={{ marginTop: 6 }}>No updates recorded yet.</div>}
            {ups.map((u) => {
              const author = memberById(u.author);
              const missing = !u.author || !u.progressText;
              const d = detect([u.progressText, u.blockerText].filter(Boolean).join(" "));
              return (
                <div key={u.id} className="row" style={{ alignItems: "flex-start" }}>
                  <Avatar member={author} size="sm" />
                  <div className="nm" style={{ fontWeight: 500 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "var(--ink-4)" }}>
                      DAY {u.sprintDay} · {missing ? "no update posted" : author?.name ?? u.author}
                      {u.submittedOnTime === false && !missing && " · late"}
                      {u.source === "beacon" && " · posted in Beacon"}
                    </div>
                    {!missing && <div style={{ marginTop: 2 }}>{u.progressText}</div>}
                    {d.signal && (
                      <div className="detectbox hot" style={{ marginTop: 8 }}>
                        <b>Reads as blocked</b> — {[...d.hits, ...d.relief].map((h) => `${h.phrase} ${h.weight > 0 ? "+" : ""}${h.weight}`).join(", ")} = {d.score} (threshold {THRESHOLD})
                        {u.statusStructured !== "blocked" && " · no blocked flag set at the time"}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {isOwner && !f.done && (
              <>
                <div className="fl" style={{ marginTop: 14 }}>Post today&apos;s update</div>
                <UpdateForm item={item} />
              </>
            )}
            {!isOwner && canAct && !f.done && (
              <div className="sub" style={{ marginTop: 10 }}>Only the owner ({firstName(item.owner)}) posts updates here.</div>
            )}
          </div>
        </div>

        <div className="col narrow">
          <AiBlock
            title="Summary"
            cite={`Built from: ${posted.length} update(s) · status · due date · dependency links`}
            footer={<Feedback target={`the ${code(item)} summary`} w={w} />}
          >
            {summary}
          </AiBlock>

          {(kb || (showHelp && helper)) && (
            <div className="card">
              <div className="ct">Help on hand</div>
              {kb && (
                <div style={{ marginTop: 8 }}>
                  <div className="fl">Runbook · matched {kb.matched.length} tags ({kb.matched.join(", ")})</div>
                  <div className="sub" style={{ marginTop: 2 }}><b>{kb.article.title}</b> — {kb.article.summary}</div>
                </div>
              )}
              {showHelp && helper && (
                <div className="sub" style={{ marginTop: 10 }}>
                  <b>{helper.member.name}</b> {helper.why}{helper.alreadyPairing ? " — already pairing on it." : "."}
                </div>
              )}
            </div>
          )}

          {story && (
            <div className="card">
              <div className="ct">Story clarity <span className="mut">{story.clarityScore}/10</span></div>
              <div className="sub" style={{ marginTop: 6 }}>{story.missing.length} gap(s) found in the acceptance criteria.</div>
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: "var(--t-body)", color: "var(--ink-3)", lineHeight: 1.5 }}>
                {story.missing.slice(0, 3).map((x, i) => <li key={i}>{x}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
