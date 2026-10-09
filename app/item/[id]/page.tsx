import Link from "next/link";
import { notFound } from "next/navigation";
import {
  itemById, memberById, updatesForItem, storyForItem, progressFor, code,
} from "@/lib/data";
import { daysFromToday } from "@/lib/demo";
import { attentionScore } from "@/lib/priorityScore";
import { Avatar, StatusPill, ScoreReasons, Crumb, AiBlock } from "@/components/ui";
import { items as allItems } from "@/lib/data";

// Pre-render every item page (required for static export; harmless otherwise).
export function generateStaticParams() {
  return allItems.map((i) => ({ id: i.id }));
}

export default function ItemDetailPage({ params }: { params: { id: string } }) {
  const item = itemById(params.id);
  if (!item) notFound();

  const owner = memberById(item.owner);
  const ups = updatesForItem(item.id);
  const story = storyForItem(item.id);
  const score = attentionScore(item);
  const due = daysFromToday(item.dueDate);
  const dueLabel = due === 0 ? "due today" : due < 0 ? `overdue ${-due}d` : `due in ${due}d`;

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
          <div className="card">
            <div className="ct">Context</div>
            <div className="sub" style={{ marginTop: 6 }}>{item.description}</div>
            <div className="barlab" style={{ marginTop: 12 }}><span>Progress</span><span>{progressFor(item)}%</span></div>
            <div className="bar"><i className={item.status === "blocked" ? "bad" : item.status === "spillover" ? "warn" : ""} style={{ width: `${progressFor(item)}%` }} /></div>
            <div className="chips" style={{ marginTop: 12 }}>
              <span className="chip">Priority: {item.priority}</span>
              {item.clientImpact && <span className="chip overdue">Client impact</span>}
              {item.dependsOn.length > 0 && item.dependsOn.map((d) => {
                const dep = itemById(d);
                return dep ? <Link key={d} className="chip" href={`/item/${d}`}>depends on {d.toUpperCase()}</Link> : <span key={d} className="chip">depends on {d.toUpperCase()}</span>;
              })}
            </div>
          </div>

          {item.blocker && (
            <div className="banner bad">
              <div className="bt"><b>Blocker:</b> {item.blocker}</div>
            </div>
          )}

          {/* the explainable attention score */}
          <div className="card">
            <div className="ct">Why this is {score.band === "high" ? "top" : "ranked here"} <span className="mut">attention = sum of reasons</span></div>
            <div style={{ marginTop: 8 }}><ScoreReasons score={score} /></div>
          </div>

          {/* the activity timeline — the AI detection story, from real updates */}
          <div className="card">
            <div className="ct">Activity timeline</div>
            {ups.length === 0 && <div className="sub" style={{ marginTop: 6 }}>No updates recorded yet.</div>}
            {ups.map((u) => {
              const author = memberById(u.author);
              return (
                <div key={u.id} className="row" style={{ alignItems: "flex-start" }}>
                  <Avatar member={author} size="sm" />
                  <div className="nm" style={{ fontWeight: 500 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "var(--ink-4)" }}>DAY {u.sprintDay} · {author?.name ?? u.author}{!u.submittedOnTime && " · late"}</div>
                    <div style={{ marginTop: 2 }}>{u.progressText}</div>
                    {u.blockerSignal && (
                      <div className="ai" style={{ marginTop: 8, padding: "10px 12px" }}>
                        <b style={{ color: "var(--ai)" }}>AI — hidden blocker likely.</b> Distress language detected
                        {u.blockerText ? <> — &ldquo;{u.blockerText}&rdquo;</> : null}, with no blocked flag set.
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="col narrow">
          <AiBlock
            title="AI summary"
            confidence={item.blocker ? 94 : 88}
            cite={`Drawn from: ${ups.length} update(s) on ${code(item)}`}
          >
            {item.blocker
              ? <>This item is blocked and on the critical path. The blocker was first visible in the day-3 update wording before it was formally raised — Beacon surfaced it {ups.filter((u) => u.blockerSignal).length > 0 ? "from the language" : "early"}, cutting the detection lag.</>
              : <>Progressing normally. {ups.length} update(s) logged, {ups.filter((u) => u.submittedOnTime).length} on time.</>}
          </AiBlock>

          {story && (
            <div className="card">
              <div className="ct">Story clarity <span className="mut">{story.clarityScore}/10</span></div>
              <div className="sub" style={{ marginTop: 6 }}>{story.missing.length} gap(s) found in the acceptance criteria.</div>
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: "var(--t-body)", color: "var(--ink-3)", lineHeight: 1.5 }}>
                {story.missing.slice(0, 3).map((x, i) => <li key={i}>{x}</li>)}
              </ul>
              <Link className="btn s sm" href="/inbox" style={{ marginTop: 10 }}>Open clarity checker</Link>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
