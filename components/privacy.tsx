"use client";

import Link from "next/link";
import { useState } from "react";
import { clearAll, type BeaconEvent } from "@/lib/events";
import { DEFAULTS, KEY as PREFS_KEY, apply, set as setPrefs } from "@/lib/prefs";
import { useActor } from "@/lib/useWorld";

/** Privacy by design, stated where the data is: what Beacon reads, keeps, and never does. */
export function PrivacyCard({ all }: { all: BeaconEvent[] }) {
  const { canAct } = useActor();
  const [confirming, setConfirming] = useState(false);

  const exportJson = () => {
    // Everything this browser holds for Beacon: the decisions and the
    // appearance preferences. Nothing else is stored anywhere.
    const payload = {
      decisions: all,
      preferences: typeof window === "undefined" ? null : JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "null"),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "beacon-decisions.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="card">
      <div className="ct">Your data <span className="mut">privacy by design</span></div>
      <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: "var(--t-body)", color: "var(--ink-3)", lineHeight: 1.55 }}>
        <li><b>Reads</b> work-item updates only — never chat, email or calendars.</li>
        <li><b>Asks the author first</b> when update wording reads as blocked; nobody else is prompted to act until they answer.</li>
        <li><b>Never scores people.</b> Adoption is counted per team and per signal type, never per person.</li>
        <li><b>Writes nothing</b> to the tracker without a person&apos;s approval; every decision is logged and can be undone.</li>
        <li><b>Stores</b> {all.length} decision event(s) in <i>this browser only</i> in the prototype, plus your theme and
          density — appearance is yours alone and is never part of the team record.</li>
      </ul>
      <div className="btnrow" style={{ marginTop: 12 }}>
        <button className="btn s sm" type="button" onClick={exportJson} disabled={!all.length}>Export my data</button>
        {canAct && !confirming && <button className="btn g sm" type="button" onClick={() => setConfirming(true)} disabled={!all.length}>Clear all</button>}
        {confirming && (
          <>
            <button className="btn d sm" type="button" onClick={() => { clearAll(); setPrefs(DEFAULTS); apply(DEFAULTS); setConfirming(false); }}>Yes, delete {all.length} event(s)</button>
            <button className="btn g sm" type="button" onClick={() => setConfirming(false)}>Keep</button>
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

