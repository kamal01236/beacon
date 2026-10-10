// Viewer preferences: appearance only.
//
// Theme, density and the nav rail are *per-viewer conveniences*, not team
// state, so they live in this browser and never reach the event log or the
// world — nothing here can change a finding, a score or a decision.
//
// Same external-store shape as lib/events.ts, so React reads it through
// useSyncExternalStore and every screen re-renders together. The <html>
// attributes are the single place the CSS looks (globals.css §2–3); an inline
// script in app/layout.tsx applies them before first paint so the page never
// flashes the wrong theme.

export type Theme = "system" | "light" | "dark";
export type Density = "comfortable" | "compact";
export type NavMode = "full" | "mini";

export interface Prefs {
  theme: Theme;
  density: Density;
  nav: NavMode;
}

export const DEFAULTS: Prefs = { theme: "system", density: "comfortable", nav: "full" };

export const KEY = "beacon.prefs.v1";

let cache: Prefs | null = null;
const listeners = new Set<() => void>();

function clean(raw: unknown): Prefs {
  const p = (raw ?? {}) as Partial<Prefs>;
  return {
    theme: p.theme === "light" || p.theme === "dark" ? p.theme : "system",
    density: p.density === "compact" ? "compact" : "comfortable",
    nav: p.nav === "mini" ? "mini" : "full",
  };
}

function load(): Prefs {
  if (cache) return cache;
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(KEY) : null;
    cache = clean(raw ? JSON.parse(raw) : null);
  } catch {
    cache = { ...DEFAULTS }; // private window or blocked storage: defaults are fine
  }
  return cache;
}

/** Mirrors the preferences onto <html>, which is all the stylesheet reads. */
export function apply(p: Prefs) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  if (p.theme === "system") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", p.theme);
  el.setAttribute("data-density", p.density);
  el.setAttribute("data-nav", p.nav);
}

export function set(patch: Partial<Prefs>) {
  const next = clean({ ...load(), ...patch });
  cache = next;
  apply(next);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* not persisted; it still holds for this page view */
  }
  listeners.forEach((l) => l());
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      apply(load());
      fn();
    }
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

export const getPrefs = (): Prefs => load();
/** Server render and hydration use the defaults; the real values arrive after. */
export const getServerPrefs = (): Prefs => DEFAULTS;

/** The next theme in the cycle: system → light → dark → system. */
export const nextTheme = (t: Theme): Theme => (t === "system" ? "light" : t === "light" ? "dark" : "system");

/** What this inline script runs before first paint, so there is no flash. */
export const BOOT_SCRIPT = `(function(){try{var p=JSON.parse(localStorage.getItem('${KEY}')||'{}'),e=document.documentElement;
if(p.theme==='light'||p.theme==='dark')e.setAttribute('data-theme',p.theme);
e.setAttribute('data-density',p.density==='compact'?'compact':'comfortable');
e.setAttribute('data-nav',p.nav==='mini'?'mini':'full');}catch(_){}})();`;
