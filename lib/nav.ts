import type { Role } from "./types";

export interface NavItem {
  key: string;
  label: string;
  href: string;
  badge?: string;
}

// Inner SVG markup for each nav icon (stroke icons, rendered in <svg viewBox="0 0 24 24">).
export const ICON: Record<string, string> = {
  overview:
    '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  board:
    '<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="14" y2="17"/>',
  inbox:
    '<path d="M3 12h5l2 3h4l2-3h5"/><path d="M4 12V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6"/><path d="M3 12v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
  delivery: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  people:
    '<circle cx="9" cy="8" r="3.4"/><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5"/><path d="M16 5.5a3.4 3.4 0 0 1 0 6.6M17.5 15c2 .7 3.5 2.3 3.5 5"/>',
  insights:
    '<line x1="6" y1="20" x2="6" y2="11"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="18" y1="20" x2="18" y2="14"/>',
  retro: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>',
  mywork: '<path d="M4 7h16v13H4z"/><path d="M9 7V4h6v3"/><path d="M4 12h16"/>',
  help:
    '<circle cx="12" cy="12" r="9"/><path d="M9.3 9.2A2.8 2.8 0 0 1 14.6 10c0 1.9-2.6 2-2.6 4"/><circle cx="12" cy="17.6" r="1"/>',
  agent:
    '<circle cx="12" cy="12" r="2.4"/><path d="M12 6.2a5.8 5.8 0 0 1 5.8 5.8"/><path d="M12 3a9 9 0 0 1 9 9"/><path d="M12 6.2A5.8 5.8 0 0 0 6.2 12"/><path d="M12 3a9 9 0 0 0-9 9"/>',
};

export const NAV: Record<Role, NavItem[]> = {
  facilitator: [
    { key: "overview", label: "Overview", href: "/overview" },
    { key: "agent", label: "Agent", href: "/agent" },
    { key: "board", label: "Board", href: "/board" },
    { key: "inbox", label: "Inbox", href: "/inbox" },
    { key: "delivery", label: "Delivery", href: "/delivery" },
    { key: "people", label: "People", href: "/people" },
    { key: "insights", label: "Insights", href: "/insights" },
    { key: "retro", label: "Retro", href: "/retro" },
  ],
  manager: [
    { key: "overview", label: "Overview", href: "/manager" },
    { key: "agent", label: "Agent", href: "/agent" },
    { key: "delivery", label: "Delivery", href: "/delivery" },
    { key: "insights", label: "Insights", href: "/insights" },
  ],
  member: [
    { key: "mywork", label: "My work", href: "/my-work" },
    { key: "board", label: "Board", href: "/board" },
    { key: "help", label: "Get help", href: "/get-help" },
    { key: "insights", label: "My trends", href: "/trends" },
  ],
};

export const ROLE_NOTE: Record<Role, string> = {
  facilitator: "Sarah · Facilitator",
  manager: "Dana · Manager · read-only",
  member: "Marcus · Member",
};

/** Where each role lands when selected. */
export function landingFor(role: Role): string {
  return NAV[role][0].href;
}
