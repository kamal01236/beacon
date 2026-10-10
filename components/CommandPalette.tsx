"use client";

// The command palette (Ctrl/Cmd-K).
//
// One keystroke reaches any work item, any person, any screen and the
// appearance controls, from anywhere. It searches the *live* world (seed +
// recorded decisions), so an item someone just moved to Blocked reads as
// blocked here too. It is navigation only — nothing in this file records a
// decision or changes a finding.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { activeItems, isDone, members, memberById } from "@/lib/data";
import { ATTENTION_THRESHOLD, attentionScore, needsAttention } from "@/lib/priorityScore";
import { useWorld } from "@/lib/useWorld";
import { useRole } from "./RoleProvider";
import { usePrefs } from "./ThemeControls";
import { NAV } from "@/lib/nav";
import { Icon } from "./Icon";
import { set as setPrefs, nextTheme } from "@/lib/prefs";
import type { ItemStatus } from "@/lib/types";

interface Hit {
  id: string;
  group: string;
  title: string;
  sub: string;
  icon: string;
  run: () => void;
  rank: number;
}

/** 0 = starts with, 1 = a word starts with, 2 = contains, -1 = no match. */
function match(q: string, hay: string): number {
  const h = hay.toLowerCase();
  if (!q) return 1;
  if (h.startsWith(q)) return 0;
  if (h.split(/[\s\-_/]+/).some((w) => w.startsWith(q))) return 1;
  return h.includes(q) ? 2 : -1;
}

const STATUS_WORD: Partial<Record<ItemStatus, string>> = {
  blocked: "Blocked",
  overdue: "Overdue",
  spillover: "Spillover",
  in_progress: "In progress",
  todo: "To do",
  monitoring: "Monitoring",
  done: "Done",
  confirmed: "Confirmed",
  resolved: "Resolved",
  cancelled: "Cancelled",
};

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const w = useWorld();
  const { role } = useRole();
  const prefs = usePrefs();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const hits = useMemo<Hit[]>(() => {
    const query = q.trim().toLowerCase();
    const go = (href: string) => () => {
      router.push(href);
      onClose();
    };
    const out: Hit[] = [];

    // Work items — ranked by the attention score when nothing is typed, so an
    // empty palette opens on what actually needs a person today. Matching
    // covers the code, the title, the status word and the owner, because
    // "blocked" and "marcus" are what people actually type.
    const its = activeItems(w);
    for (const it of its) {
      const s = attentionScore(it, w);
      const owner = memberById(it.owner);
      const fields = [it.id, it.title, STATUS_WORD[it.status] ?? it.status, owner?.name ?? "unassigned"];
      const r = Math.min(...fields.map((f) => match(query, f)).filter((n) => n >= 0).concat(99));
      if (r === 99) continue;
      out.push({
        id: `item-${it.id}`,
        group: "Work items",
        title: it.title,
        sub: `${it.id.toUpperCase()} · ${STATUS_WORD[it.status] ?? it.status} · ${owner?.name ?? "unassigned"}${
          needsAttention(it, w) ? ` · attention ${s.value}` : ""
        }`,
        icon: "board",
        run: go(`/item/${it.id}`),
        // without a query, sort by attention; with one, by match quality
        rank: query ? r * 1000 - s.value : 1000 - s.value,
      });
    }

    // People — member drill-downs belong to the facilitator's view only, so the
    // palette must not offer a way around that (README → Privacy by design).
    if (role === "facilitator") {
      for (const m of members) {
        const r = Math.min(...[m.name, m.role].map((f) => match(query, f)).filter((n) => n >= 0).concat(99));
        if (r === 99) continue;
        out.push({
          id: `member-${m.id}`,
          group: "People",
          title: m.name,
          sub: m.role,
          icon: "people",
          run: go(`/people/${m.id}`),
          rank: r,
        });
      }
    }

    // Saved views — the slices a facilitator opens every morning, each one a
    // board filter with its live count, so the number is never stale.
    const views = [
      { label: "Needs attention", href: `/board?min=${ATTENTION_THRESHOLD}`, n: its.filter((i) => needsAttention(i, w)).length, words: "attention hotspots score risk" },
      { label: "Blocked", href: "/board?status=blocked", n: its.filter((i) => i.status === "blocked").length, words: "blocked stuck" },
      { label: "Overdue", href: "/board?status=overdue", n: its.filter((i) => i.status === "overdue").length, words: "overdue late past due" },
      { label: "Spillover", href: "/board?status=spillover", n: its.filter((i) => i.spillover && !isDone(i)).length, words: "spillover carried over" },
      { label: "Done", href: "/board?status=done", n: its.filter(isDone).length, words: "done finished complete" },
    ];
    for (const v of views) {
      const r = Math.min(...[v.label, v.words].map((f) => match(query, f)).filter((n) => n >= 0).concat(99));
      if (r === 99) continue;
      out.push({
        id: `view-${v.label}`,
        group: "Views",
        title: `${v.label} — ${v.n} item${v.n === 1 ? "" : "s"}`,
        sub: "Opens the board filtered to this slice",
        icon: "board",
        run: go(v.href),
        rank: r,
      });
    }

    for (const n of NAV[role]) {
      const r = match(query, n.label);
      if (r < 0) continue;
      out.push({ id: `nav-${n.key}`, group: "Go to", title: n.label, sub: n.href, icon: n.key, run: go(n.href), rank: r });
    }

    const cmds = [
      {
        key: "theme",
        label: `Theme: ${prefs.theme} — switch to ${nextTheme(prefs.theme)}`,
        words: "theme dark light appearance contrast",
        run: () => setPrefs({ theme: nextTheme(prefs.theme) }),
      },
      {
        key: "density",
        label: `Density: ${prefs.density} — switch to ${prefs.density === "compact" ? "comfortable" : "compact"}`,
        words: "density compact comfortable spacing",
        run: () => setPrefs({ density: prefs.density === "compact" ? "comfortable" : "compact" }),
      },
      {
        key: "nav",
        label: prefs.nav === "mini" ? "Expand the navigation rail" : "Collapse the navigation rail",
        words: "navigation sidebar collapse expand rail",
        run: () => setPrefs({ nav: prefs.nav === "mini" ? "full" : "mini" }),
      },
    ];
    for (const c of cmds) {
      const r = Math.min(...[c.label, c.words].map((f) => match(query, f)).filter((n) => n >= 0).concat(99));
      if (r === 99) continue;
      out.push({
        id: `cmd-${c.key}`,
        group: "Appearance",
        title: c.label,
        sub: "This browser only — never part of the team record",
        icon: "agent",
        run: () => {
          c.run();
          onClose();
        },
        rank: r,
      });
    }

    const order = ["Work items", "Views", "People", "Go to", "Appearance"];
    const cap: Record<string, number> = { "Work items": 7, Views: 4, People: 4, "Go to": 5, Appearance: 3 };
    const seen: Record<string, number> = {};
    return out
      .sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.rank - b.rank || a.title.localeCompare(b.title))
      .filter((h) => (seen[h.group] = (seen[h.group] ?? 0) + 1) <= cap[h.group]);
  }, [q, w, role, prefs, router, onClose]);

  useEffect(() => setSel(0), [q]);

  // Keep the highlighted row in view when arrowing through a long list.
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) {
      e.preventDefault();
      setSel((s) => (hits.length ? (s + 1) % hits.length : 0));
    } else if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) {
      e.preventDefault();
      setSel((s) => (hits.length ? (s - 1 + hits.length) % hits.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      hits[sel]?.run();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  let group = "";

  return (
    <div
      className="scrim"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Search and commands" onKeyDown={onKey}>
        <div className="cmdk-in">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.6-3.6" />
          </svg>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search items, people, screens…"
            aria-label="Search items, people and screens"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-list"
            aria-activedescendant={hits[sel]?.id}
          />
          <span className="kbd">Esc</span>
        </div>

        <div className="cmdk-list" id="cmdk-list" role="listbox" ref={listRef} aria-label="Results">
          {hits.length === 0 && (
            <div className="cmdk-empty">
              Nothing matches <b>{q}</b>. Try an item code, a status like <b>blocked</b>, a name, or a screen.
            </div>
          )}
          {hits.map((h, i) => {
            const head = h.group !== group ? ((group = h.group), h.group) : null;
            return (
              <div key={h.id}>
                {head && <div className="cmdk-lab">{head}</div>}
                <button
                  type="button"
                  id={h.id}
                  role="option"
                  aria-selected={i === sel}
                  className="cmdk-row"
                  onMouseMove={() => setSel(i)}
                  onClick={h.run}
                >
                  <span className="ic">
                    <Icon name={h.icon} size={15} />
                  </span>
                  <span className="tx">
                    <b>{h.title}</b>
                    <small>{h.sub}</small>
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        <div className="cmdk-foot">
          <span>
            <span className="kbd">↑↓</span> move
          </span>
          <span>
            <span className="kbd">↵</span> open
          </span>
          <span>
            {q.trim() ? "Ranked by match" : "Ranked by attention score"} · searches the live board, not a cached index
          </span>
        </div>
      </div>
    </div>
  );
}
