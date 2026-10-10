"use client";

import { useEffect, useState } from "react";
import { Nav } from "./Nav";
import { PersonaSwitcher } from "./PersonaSwitcher";
import { NavToggle, ThemeControls } from "./ThemeControls";
import { CommandPalette } from "./CommandPalette";
import { Toaster } from "./Toaster";
import { activeSprint } from "@/lib/data";
import { sprintDay } from "@/lib/demo";
import { apply, getPrefs } from "@/lib/prefs";

// The ONE header + shell every screen renders inside. Because it is defined
// once, the header can never drift between screens (brand, sprint, search,
// appearance and persona are always in the same place), and the persona
// switcher is the single way to move between facilitator / manager / member.
export function AppShell({ children }: { children: React.ReactNode }) {
  const day = sprintDay(activeSprint.startDate);
  const total = sprintDay(activeSprint.startDate, activeSprint.endDate);
  const [cmd, setCmd] = useState(false);

  // Re-apply stored preferences after hydration, in case the boot script in
  // app/layout.tsx could not run (and so the markup matches the DOM).
  useEffect(() => apply(getPrefs()), []);

  // One keyboard contract for the whole product: Ctrl/Cmd-K anywhere, or "/"
  // when you are not already typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLElement &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCmd((o) => !o);
      } else if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setCmd(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app">
      <a className="skip" href="#main">
        Skip to content
      </a>

      <header className="topbar">
        <NavToggle />
        <div className="brand">
          <svg className="mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <circle cx="12" cy="12" r="2.6" />
            <path d="M16.8 7.2a6.8 6.8 0 0 1 0 9.6M7.2 16.8a6.8 6.8 0 0 1 0-9.6" />
            <path d="M20.2 3.8a11.6 11.6 0 0 1 0 16.4M3.8 20.2a11.6 11.6 0 0 1 0-16.4" />
          </svg>
          Bea<span>con</span>
        </div>
        <span className="tag" title={`${activeSprint.client} · ${activeSprint.project}`}>
          <span className="dot" aria-hidden="true" />
          {activeSprint.name} · Day {day}/{total}
        </span>

        <button className="search" type="button" onClick={() => setCmd(true)} aria-keyshortcuts="Control+K Meta+K">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.6-3.6" />
          </svg>
          <span className="sl">Search items, people, screens…</span>
          <span className="kbd" aria-hidden="true">
            Ctrl K
          </span>
        </button>

        <div className="spacer" />
        <ThemeControls />
        <PersonaSwitcher />
      </header>

      <div className="body">
        <Nav />
        <main className="main" id="main" tabIndex={-1}>
          <div className="mainwrap">{children}</div>
        </main>
      </div>

      {cmd && <CommandPalette onClose={() => setCmd(false)} />}
      <Toaster />
    </div>
  );
}
