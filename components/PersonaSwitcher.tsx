"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useRole } from "./RoleProvider";
import { landingFor } from "@/lib/nav";
import type { Role } from "@/lib/types";

const ROLES: { role: Role; label: string; sub: string; color: string }[] = [
  { role: "facilitator", label: "Sarah Chen", sub: "Facilitator · Scrum Master", color: "#1A6B6B" },
  { role: "manager", label: "Dana Olsen", sub: "Delivery Manager · read-only", color: "#5A4A1A" },
  { role: "member", label: "Marcus Williams", sub: "Backend Developer · Member", color: "#1B5E8A" },
];

const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");

export function PersonaSwitcher() {
  const { role, setRole } = useRole();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const current = ROLES.find((r) => r.role === role)!;

  // Escape closes the menu wherever focus sits — the same contract as the palette.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        box.current?.querySelector("button")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function pick(r: Role) {
    setRole(r);
    setOpen(false);
    router.push(landingFor(r));
  }

  return (
    <div
      className="persona"
      ref={box}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className="av" style={{ background: current.color }} aria-hidden="true">
          {initials(current.label)}
        </span>
        <span className="pn">
          {current.label.split(" ")[0]} · {current.sub.split(" · ")[0]}
        </span>
        <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="pmenu" role="menu">
          <div className="ph">View as</div>
          {ROLES.map((r) => (
            <button key={r.role} type="button" role="menuitem" className={r.role === role ? "on" : ""} onClick={() => pick(r.role)}>
              <span className="av sm" style={{ background: r.color }} aria-hidden="true">
                {initials(r.label)}
              </span>
              <span>
                {r.label}
                <small>{r.sub}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
