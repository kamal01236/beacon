import Link from "next/link";
import { getRun, getSignals, getRequests, SIGNAL_LABEL } from "@/lib/agent";
import { memberById } from "@/lib/data";

export default function AgentPage() {
  const run = getRun();
  const signals = getSignals();
  const requests = getRequests();

  return (
    <>
      <h1 className="h1">Beacon agent</h1>
      <div className="sub">
        Runs headless every {run.intervalMins} minutes and on events. Reads the tracker, git history and
        the knowledge base, keeps sprint-by-sprint memory, and proposes next actions — it never writes to
        Jira on its own.
      </div>

      {/* last run summary */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="ct">Last run <span className="mut">{run.ranAt} · {run.trigger}</span></div>
        <div className="kpis" style={{ marginTop: 12 }}>
          <div className="kpi"><div className="klab">Items scanned</div><div className="kval">{run.itemsScanned}</div></div>
          <div className="kpi bad"><div className="klab">Signals found</div><div className="kval">{run.signalsFound}</div></div>
          <div className="kpi risk"><div className="klab">Awaiting input</div><div className="kval">{run.openRequests}</div></div>
          <div className="kpi"><div className="klab">Next run</div><div className="kval" style={{ fontSize: 18 }}>in {run.intervalMins}m</div></div>
        </div>
        <div className="chips" style={{ marginTop: 12 }}>
          {run.scope.map((s) => <span key={s} className="chip ai">{s}</span>)}
          <span className="chip">memory: {run.memory}</span>
        </div>
      </div>

      {/* the human-in-the-loop input requests */}
      <h2 className="h2">Needs your input</h2>
      <div className="sub" style={{ marginTop: -4 }}>
        When the agent can&apos;t resolve something from the data, it asks — and re-asks each run until answered.
      </div>
      {requests.length === 0 && (
        <div className="state" style={{ marginTop: 10 }}>
          <div className="st">Nothing outstanding</div>
          <div className="sx">Every open question has an answer; the agent will keep watching.</div>
        </div>
      )}
      {requests.map((r) => {
        const to = memberById(r.toMemberId);
        return (
          <div key={r.id} className="ai" style={{ marginTop: 12 }}>
            <div className="aihead">
              <div className="ct">{r.itemId.toUpperCase()} · asking {to?.name.split(" ")[0] ?? "owner"}</div>
              <span className="conf low">re-asked {r.reaskCount}×</span>
            </div>
            <div className="aiout">{r.question}</div>
            <div className="cite">Open since day {r.askedOnDay - r.reaskCount} · will re-ask next run if unanswered</div>
            <div className="aiact">
              <button className="btn p sm" type="button">Answer</button>
              <Link className="btn s sm" href={`/item/${r.itemId}`}>Open {r.itemId.toUpperCase()}</Link>
              <button className="btn g sm" type="button">Snooze</button>
            </div>
          </div>
        );
      })}

      {/* assessments + proposed next actions */}
      <h2 className="h2">Assessments &amp; next actions</h2>
      {signals.map((s) => (
        <div key={s.id} className="card" style={{ marginTop: 12 }}>
          <div className="ct">
            <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span className={`pill ${s.severity === "high" ? "r" : s.severity === "medium" ? "a" : "n"}`}>{SIGNAL_LABEL[s.kind]}</span>
              <Link href={`/item/${s.itemId}`}>{s.summary}</Link>
            </span>
            <span className="mut">conf {s.confidence}%</span>
          </div>
          <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: "var(--t-body)", color: "var(--ink-3)", lineHeight: 1.5 }}>
            {s.evidence.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
          <div className="cite" style={{ color: "var(--ink-4)" }}>Source: {s.source}{s.owner ? ` · owner ${s.owner.name}` : ""}</div>
          <div className="btnrow" style={{ marginTop: 10 }}>
            {s.actions.map((a, i) => (
              <button key={i} className={`btn ${i === 0 ? "p" : "s"} sm`} type="button">{a.label}</button>
            ))}
          </div>
        </div>
      ))}

      <div className="banner ai" style={{ marginTop: 16 }}>
        <div className="bt">
          <b>How this works.</b> The agent&apos;s findings are written to its own store (not the tracker) and this
          dashboard reads from there, so every role sees the same picture. Jira / Azure DevOps stays the system
          of record — any write is previewed and approved by a human first. Context carries sprint to sprint, so
          the agent can cite how similar items were resolved before.
        </div>
      </div>
    </>
  );
}
