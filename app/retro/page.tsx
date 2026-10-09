"use client";

import { retroThemes } from "@/lib/insights";
import { effective, undo } from "@/lib/events";
import { firstName } from "@/lib/data";
import { useActor, useWorld } from "@/lib/useWorld";

export default function RetroPage() {
  const w = useWorld();
  const { act, canAct } = useActor();
  const themes = retroThemes(w);
  const adopted = effective(w.events).filter((e) => e.kind === "retro.adopted") as Extract<(typeof w.events)[number], { kind: "retro.adopted" }>[];

  return (
    <>
      <h1 className="h1">Retrospective</h1>
      <div className="sub">Themes are built from this sprint&apos;s blockers, update wording, dependencies and spillover — each with its evidence. The team decides which actions to adopt.</div>

      {themes.map((t) => {
        const a = adopted.find((x) => x.themeId === t.id);
        return (
          <div key={t.id} className="card" style={{ marginTop: 14 }}>
            <div className="ct">{t.title}</div>
            <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: "var(--t-body)", color: "var(--ink-3)", lineHeight: 1.5 }}>
              {t.evidence.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
            <div className="banner ai" style={{ marginTop: 10 }}>
              <div className="bt"><b>Suggested action:</b> {t.action}</div>
            </div>
            <div className="decide">
              {a ? (
                <span className="stamp"><b>Adopted</b> by {firstName(a.actor)} — tracked into next sprint{canAct && <> · <button className="link" type="button" onClick={() => undo(a.id, a.actor)}>undo</button></>}</span>
              ) : (
                canAct && <button className="btn p sm" type="button" onClick={() => act({ kind: "retro.adopted", themeId: t.id, action: t.action })}>Adopt action</button>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
