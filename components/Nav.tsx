"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRole } from "./RoleProvider";
import { Icon } from "./Icon";
import { NAV, ROLE_NOTE } from "@/lib/nav";

const ROLE_HEAD: Record<string, string> = {
  facilitator: "Facilitator",
  manager: "Manager · read-only",
  member: "My view",
};

export function Nav() {
  const { role } = useRole();
  const pathname = usePathname();
  const items = NAV[role];

  return (
    <nav className="sidenav" aria-label={`${role} navigation`}>
      <div className="navlab">{ROLE_HEAD[role] ?? role}</div>
      {items.map((it) => {
        const active = pathname === it.href || pathname.startsWith(it.href + "/");
        return (
          <Link
            key={it.key}
            href={it.href}
            className={active ? "nav on" : "nav"}
            aria-current={active ? "page" : undefined}
            // the label when the rail is collapsed to icons
            title={it.label}
          >
            <Icon name={it.key} />
            <span>{it.label}</span>
            {it.badge ? <span className="count">{it.badge}</span> : null}
          </Link>
        );
      })}
      <span className="navgap" />
      <span className="navnote">{ROLE_NOTE[role]}</span>
    </nav>
  );
}
