"use client";

// "Run now" — the one place the UI touches the real agent worker.
//
// The Agent screen's headline figures (items scanned, open signals) are derived
// live from the world, so they are always true. What they cannot show is the
// RUN itself: which detector actually read the updates, whether a model was
// reachable, how often it disagreed with the rules. That only exists on the
// server, so this component asks for it:
//
//   GET  /api/agent/run  → the last few recorded runs (newest first)
//   POST /api/agent/run  → trigger one now, and show what it found
//
// Without a backend (the static Pages export) both calls fail and the component
// says so plainly rather than pretending a run happened.

import { useCallback, useEffect, useState } from "react";

interface RunHead {
  at: string;
  trigger: string;
  detector: string;
  provider: string | null;
  model: string | null;
  itemsScanned: number;
  signalsOpen: number;
}

interface RunResult extends Omit<RunHead, "at"> {
  llmCalls: number;
  disagreements: number;
  composed: number;
  errors: number;
}

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

const detectorLabel = (r: { detector: string; provider: string | null; model: string | null }) =>
  r.provider ? `${r.detector} · ${r.provider}${r.model ? ` (${r.model})` : ""}` : `${r.detector} (no model configured)`;

export function AgentRunPanel() {
  const [runs, setRuns] = useState<RunHead[] | null>(null);
  const [last, setLast] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/agent/run");
      if (!r.ok) throw new Error(String(r.status));
      setRuns((await r.json()) as RunHead[]);
      setOffline(false);
    } catch {
      setOffline(true); // no backend: the static export has no route handlers
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runNow = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trigger: "manual" }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error || r.statusText);
      setLast(body as RunResult);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (offline) {
    return (
      <div className="card" style={{ marginTop: 14 }}>
        <div className="ct">Agent runs <span className="mut">no backend on this deployment</span></div>
        <div className="sub" style={{ marginTop: 6 }}>
          This is the static export, so there is no agent process to trigger — every assessment below is derived in your
          browser by the same rules the worker uses. Run the server build (<code>npm run local</code>) to trigger a real run.
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div className="ct">
        Agent runs <span className="mut">{runs?.length ? `${runs.length} recorded` : "none recorded yet"}</span>
      </div>
      <div className="sub" style={{ marginTop: 6 }}>
        The worker runs on its cadence and on tracker events. Trigger one here to watch it read every active item and
        re-derive its assessments — it still writes nothing to the tracker.
      </div>

      {last && (
        <div className={`detectbox${last.errors ? " hot" : ""}`} style={{ marginTop: 10 }}>
          <b>Run finished.</b> Detector {detectorLabel(last)} · scanned {last.itemsScanned} item(s) · {last.signalsOpen} open
          signal(s){last.llmCalls ? ` · ${last.llmCalls} model call(s)` : ""}
          {last.llmCalls ? ` · disagreed with the rules on ${last.disagreements}` : ""}
          {last.composed ? ` · drafted ${last.composed} comment(s)` : ""}
          {last.errors ? ` · ${last.errors} model error(s), those items fell back to the rules` : ""}.
        </div>
      )}
      {error && <div className="detectbox hot" style={{ marginTop: 10 }}><b>Run failed.</b> {error}</div>}

      {runs?.map((r) => (
        <div key={r.at} className="row" style={{ alignItems: "flex-start" }}>
          <time style={{ fontSize: 10.5, fontWeight: 800, color: "var(--ink-4)", flex: "0 0 92px", paddingTop: 2 }}>{when(r.at)}</time>
          <div className="nm" style={{ fontWeight: 500 }}>
            {r.trigger} run · {detectorLabel(r)}
            <small>scanned {r.itemsScanned} · {r.signalsOpen} open signal(s)</small>
          </div>
        </div>
      ))}

      <div className="btnrow" style={{ marginTop: 12 }}>
        <button className="btn p sm" type="button" disabled={busy} onClick={runNow}>{busy ? "Running…" : "Run now"}</button>
      </div>
    </div>
  );
}
