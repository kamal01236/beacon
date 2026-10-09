import { activeItems } from "@/lib/data";

export default function RetroPage() {
  const items = activeItems();
  const spillovers = items.filter((i) => i.spillover);
  const blocked = items.filter((i) => i.blocker);

  const themes = [
    {
      title: "External dependencies surface late",
      evidence: `${blocked.length} blocked item(s); REQ-001's Stripe signature blocker was in day-3 wording before it was raised.`,
      action: "Add a 'blocked-by external' flag at planning and review dependencies daily.",
    },
    {
      title: "Ambiguous acceptance criteria cause rework",
      evidence: "REQ-001 story scored 3/10 for clarity; 6 gaps found.",
      action: "Run the clarity checker before a story enters the sprint.",
    },
    {
      title: "Spillover carries silent risk",
      evidence: `${spillovers.length} item(s) carried from Sprint 1; one had no fresh update for 2 days.`,
      action: "Treat spillover as first-class work with its own owner and cadence.",
    },
  ];

  return (
    <>
      <h1 className="h1">Retrospective</h1>
      <div className="sub">AI groups the sprint&apos;s signals into themes with evidence — you decide the actions. Carried actions are tracked, not lost.</div>

      {themes.map((t) => (
        <div key={t.title} className="card" style={{ marginTop: 14 }}>
          <div className="ct">{t.title}</div>
          <div className="sub" style={{ marginTop: 6 }}><b>Evidence:</b> {t.evidence}</div>
          <div className="banner ai" style={{ marginTop: 10 }}>
            <div className="bt"><b>Suggested action:</b> {t.action}</div>
          </div>
          <div className="btnrow" style={{ marginTop: 10 }}>
            <button className="btn p sm" type="button">Adopt action</button>
            <button className="btn s sm" type="button">Edit</button>
          </div>
        </div>
      ))}
    </>
  );
}
