"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Role } from "@/lib/types";

interface RoleCtx {
  role: Role;
  setRole: (r: Role) => void;
}

const Ctx = createContext<RoleCtx>({ role: "facilitator", setRole: () => {} });

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRoleState] = useState<Role>("facilitator");

  // Restore the last-used role for this viewer (per-browser convenience only).
  useEffect(() => {
    try {
      const saved = localStorage.getItem("beacon.role") as Role | null;
      if (saved === "facilitator" || saved === "manager" || saved === "member") {
        setRoleState(saved);
      }
    } catch {
      /* storage can be blocked; the default role is fine */
    }
  }, []);

  function setRole(r: Role) {
    setRoleState(r);
    try {
      localStorage.setItem("beacon.role", r);
    } catch {
      /* ignore */
    }
  }

  return <Ctx.Provider value={{ role, setRole }}>{children}</Ctx.Provider>;
}

export function useRole() {
  return useContext(Ctx);
}
