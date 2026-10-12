"use client";

import Link from "next/link";
import { useState } from "react";
import { resetInstance, storageMode, type BeaconEvent } from "@/lib/events";
import { DECISION_RETENTION_DAYS, retentionReport } from "@/lib/policy";
import { DEFAULTS, KEY as PREFS_KEY, apply, set as setPrefs } from "@/lib/prefs";
import { push } from "@/lib/toast";
import { useActor } from "@/lib/useWorld";

const prefsSnapshot = () =>
  typeof window === "undefined" ? null : JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "null");

function download(name: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Privacy by design, stated where the data is: what Beacon reads, what it keeps,
 * for how long, and how a person's own record is answered. The policy itself
 * lives in lib/policy.ts so this copy cannot drift from what the code does.
 */
export function PrivacyCard({ all }: { all: BeaconEvent[] }) {
  const { memberId } = useActor();
  // Say where the decisions actually live, rather than assuming the browser:
  // with the backend running they are on the server and shared across sessions.
  const onServer = storageMode() === "server";
  // In server mode the log is the team's record, so "my data" is the subset this
  // person is the subject of. In the static build the whole log is theirs anyway.
  const mine = onServer ? all.filter((e) => e.actor === memberId) : all;
  const retention = retentionReport(all);

  return (
    <div className="card">
      <div className="ct">Your data <span className="mut">privacy by design</span></div>
      <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: "var(--t-body)", color: "var(--ink-3)", lineHeight: 1.55 }}>
        <li><b>Reads</b> work-item updates only — never chat, email or calendars.</li>
        <li><b>Asks the author first</b> when update wording reads as blocked; nobody else is prompted to act until they answer.</li>
        <li><b>Never scores people.</b> Adoption is counted per team and per signal type, never per person.</li>
        <li><b>Writes nothing</b> to the tracker without a person&apos;s approval; every decision is logged and can be undone.</li>
        <li><b>Keeps</b> {all.length} decision event(s){onServer
          ? " in this prototype's own append-only log on the server — the team's shared record, and what the agent reads"
          : " in this browser only — nothing is sent anywhere"}, plus your theme and
          density, which stay in this browser alone and are never part of the team record.</li>
        <li><b>Ages them out</b> after {DECISION_RETENTION_DAYS} days — a schedule the system applies
          ({retention.expired} of {retention.total} past the window right now), not a button anyone presses.
          The removal is itself written to the log, so a gap is never unexplained.</li>
        <li><b>Erases a person by un-naming them,</b> not by deleting the record: because the log is the
          audit trail, an erasure request pseudonymises who acted and leaves the decision standing.
          That needs sign-in to know who is asking, so it arrives with phase 4 — stated here, not yet built.</li>
      </ul>
      <div className="btnrow" style={{ marginTop: 12 }}>
        <button
          className="btn s sm"
          type="button"
          disabled={!mine.length}
          onClick={() => download("beacon-my-data.json", { subject: memberId, decisions: mine, preferences: prefsSnapshot() })}
        >
          Export my data ({mine.length})
        </button>
        {onServer && mine.length !== all.length && (
          <button
            className="btn g sm"
            type="button"
            disabled={!all.length}
            onClick={() => download("beacon-team-log.json", { scope: "team", decisions: all })}
          >
            Export the team log ({all.length})
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Emptying the log is an operator action, not a privacy control — so it is shown
 * as one, apart from the policy above. In server mode the log is the team's
 * audit trail, so only the facilitator may reset it; in the static build it is
 * the viewer's own browser and affects nobody else.
 */
export function DataResetCard({ all }: { all: BeaconEvent[] }) {
  const { canAct, role, memberId } = useActor();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const onServer = storageMode() === "server";
  if (!canAct || (onServer && role !== "facilitator")) return null;
  // A log holding nothing but its own reset markers has nothing left to reset —
  // otherwise each reset would delete the last one's record and leave its own.
  const decisions = all.filter((e) => e.kind !== "data.reset" && e.kind !== "data.retained").length;

  const wipe = async () => {
    setBusy(true);
    try {
      const removed = await resetInstance(memberId);
      // No undo on the toast: a deletion has no way back, and saying so is the
      // point. What it does leave behind is the data.reset row in the log.
      push({
        title: `${removed} decision(s) deleted`,
        message: onServer
          ? "The shared log is empty, and this reset is the one row left in it."
          : "This browser's record is empty; nothing was ever sent anywhere.",
        tone: "warn",
      });
      if (!onServer) {
        // Only the browser-local reset touches preferences: they are this
        // viewer's own, and in server mode they are not part of what was wiped.
        setPrefs(DEFAULTS);
        apply(DEFAULTS);
      }
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="ct">
        {onServer ? "Reset this instance" : "Clear this browser"}
        <span className="mut">{onServer ? "demo operator action" : "nothing left this browser"}</span>
      </div>
      <div className="sub" style={{ marginTop: 4 }}>
        {onServer ? (
          <>
            Deletes all {all.length} event(s) from the <b>shared</b> server log so the next walkthrough
            starts clean. It is not how a person&apos;s data is erased — that is retention and pseudonymisation,
            above. The reset is appended to the emptied log, so there is a record that it happened.
          </>
        ) : (
          <>
            Deletes the {all.length} event(s) this browser is holding, plus your theme and density.
            Nothing was ever sent anywhere, so this affects nobody else.
          </>
        )}
      </div>
      <div className="btnrow" style={{ marginTop: 10 }}>
        {!confirming && (
          <button className="btn g sm" type="button" onClick={() => setConfirming(true)} disabled={!decisions}>
            {onServer ? "Reset…" : "Clear all"}
          </button>
        )}
        {confirming && (
          <>
            <button className="btn d sm" type="button" disabled={busy} onClick={wipe}>
              {busy ? "Deleting…" : `Yes, delete ${all.length} event(s)${onServer ? " for everyone" : ""}`}
            </button>
            <button className="btn g sm" type="button" disabled={busy} onClick={() => setConfirming(false)}>Keep</button>
          </>
        )}
      </div>
    </div>
  );
}

/** Shown to the manager role wherever a per-person view would otherwise appear. */
export function TeamOnlyNote() {
  return (
    <div className="state" style={{ marginTop: 14 }}>
      <div className="st">Member views stay with the team</div>
      <div className="sx">Managers see team-level figures only (Overview, Delivery, Insights). Per-person views are for the facilitator and the person themselves — privacy by design.</div>
      <Link className="btn p sm" href="/manager">Back to the team view</Link>
    </div>
  );
}
