"use client";

// Appearance controls in the chrome: theme, density, nav rail.
//
// These are per-viewer conveniences stored in this browser (lib/prefs.ts).
// Server render and hydration use the defaults, then the real values arrive —
// so the markup never disagrees with the server, and the inline boot script in
// app/layout.tsx has already painted the right theme.

import { useSyncExternalStore } from "react";
import { getPrefs, getServerPrefs, nextTheme, set, subscribe, type Prefs } from "@/lib/prefs";

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribe, getPrefs, getServerPrefs);
}

const THEME_ICON: Record<Prefs["theme"], React.ReactNode> = {
  system: (
    <>
      <rect x="2.5" y="4" width="19" height="13" rx="2" />
      <path d="M8 20h8" />
    </>
  ),
  light: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" />
    </>
  ),
  dark: <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z" />,
};

const THEME_LABEL: Record<Prefs["theme"], string> = {
  system: "following your system setting",
  light: "light",
  dark: "dark",
};

export function ThemeControls() {
  const p = usePrefs();

  return (
    <>
      <button
        className="iconbtn"
        type="button"
        onClick={() => set({ theme: nextTheme(p.theme) })}
        title={`Theme: ${THEME_LABEL[p.theme]} — click for ${THEME_LABEL[nextTheme(p.theme)]}`}
        aria-label={`Theme: ${THEME_LABEL[p.theme]}. Switch to ${THEME_LABEL[nextTheme(p.theme)]}.`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          {THEME_ICON[p.theme]}
        </svg>
      </button>

      <button
        className={`iconbtn${p.density === "compact" ? " on" : ""}`}
        type="button"
        onClick={() => set({ density: p.density === "compact" ? "comfortable" : "compact" })}
        title={`Density: ${p.density} — click for ${p.density === "compact" ? "comfortable" : "compact"}`}
        aria-label={`Density: ${p.density}. Switch to ${p.density === "compact" ? "comfortable" : "compact"}.`}
        aria-pressed={p.density === "compact"}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          {p.density === "compact" ? (
            <path d="M4 5h16M4 10h16M4 14h16M4 19h16" />
          ) : (
            <path d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>
    </>
  );
}

/** Collapses the side rail to icons — for the person who wants the board wide. */
export function NavToggle() {
  const p = usePrefs();
  const mini = p.nav === "mini";
  return (
    <button
      className="iconbtn"
      type="button"
      onClick={() => set({ nav: mini ? "full" : "mini" })}
      title={mini ? "Expand the navigation" : "Collapse the navigation"}
      aria-label={mini ? "Expand the navigation" : "Collapse the navigation"}
      aria-pressed={mini}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M9 4v16" />
        {mini ? <path d="M13 9l3 3-3 3" /> : <path d="M17 9l-3 3 3 3" />}
      </svg>
    </button>
  );
}
