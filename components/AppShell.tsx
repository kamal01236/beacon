"use client";

import { Nav } from "./Nav";
import { PersonaSwitcher } from "./PersonaSwitcher";
import { activeSprint } from "@/lib/data";
import { sprintDay } from "@/lib/demo";

// The ONE header + shell every screen renders inside. Because it is defined
// once, the header can never drift between screens (brand, sprint, search and
// persona are always in the same place), and the persona switcher is the single
// way to move between the facilitator / manager / member views.
export function AppShell({ children }: { children: React.ReactNode }) {
  const day = sprintDay(activeSprint.startDate);
  const total =
    sprintDay(activeSprint.startDate, activeSprint.endDate);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          Bea<span>con</span>
        </div>
        <span className="tag">
          {activeSprint.name} · Day {day}/{total}
        </span>
        <input
          className="search"
          type="search"
          placeholder="Search items, people, decisions…"
          aria-label="Search"
        />
        <div className="spacer" />
        <PersonaSwitcher />
      </header>

      <div className="body">
        <Nav />
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
