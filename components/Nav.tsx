"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRole } from "./RoleProvider";
import { Icon } from "./Icon";
import { NAV, ROLE_NOTE } from "@/lib/nav";

export function Nav() {
  const { role } = useRole();
  const pathname = usePathname();
  const items = NAV[role];

  return (
    <nav className="sidenav" aria-label={`${role} navigation`}>
      {items.map((it) => {
        const active =
          pathname === it.href || pathname.startsWith(it.href + "/");
        return (
          <Link
            key={it.key}
            href={it.href}
            className={active ? "nav on" : "nav"}
            aria-current={active ? "page" : undefined}
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
