"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useRole } from "./RoleProvider";
import { landingFor } from "@/lib/nav";
import type { Role } from "@/lib/types";

const ROLES: { role: Role; label: string; sub: string }[] = [
  { role: "facilitator", label: "Sarah Chen", sub: "Facilitator · Scrum Master" },
  { role: "manager", label: "Dana Olsen", sub: "Delivery Manager · read-only" },
  { role: "member", label: "Marcus Williams", sub: "Backend Developer · Member" },
];

export function PersonaSwitcher() {
  const { role, setRole } = useRole();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const current = ROLES.find((r) => r.role === role)!;

  function pick(r: Role) {
    setRole(r);
    setOpen(false);
    router.push(landingFor(r));
  }

  return (
    <div className="persona" onBlur={(e) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
    }}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {current.label.split(" ")[0]} · {current.sub.split(" · ")[0]}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="pmenu" role="menu">
          <div className="ph">View as</div>
          {ROLES.map((r) => (
            <button
              key={r.role}
              type="button"
              role="menuitem"
              className={r.role === role ? "on" : ""}
              onClick={() => pick(r.role)}
            >
              {r.label}
              <small>{r.sub}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
